/*

	WebGL 2 renderer for a 3D model editor.
	Written by Cosmin Apreutesei.

	Based on tutorials from learnopengl.com.

*/

(function() {

let gl = WebGL2RenderingContext.prototype

gl.module('mesh.vs', `

	#version 300 es

	precision highp float;
	precision highp int;

	uniform mat4 view;
	uniform mat4 proj;
	uniform mat4 view_proj;
	uniform vec2 viewport_size;

	in mat4 model;
	in vec3 pos;
	in vec3 normal;
	in vec2 uv;

	out vec3 v_pos;
	out vec3 v_normal;
	out vec2 v_uv;

	vec4 mvp(vec3 pos) {
		return view_proj * model * vec4(pos, 1.0);
	}

`)

gl.module('mesh.fs', `

	#version 300 es

	precision highp float;
	precision highp int;

	uniform vec3 view_pos;
	uniform vec2 viewport_size;
	uniform vec3 diffuse_color;
	uniform sampler2D diffuse_map;

	in vec3 v_pos;
	in vec3 v_normal;
	in vec2 v_uv;

	layout (location = 0) out vec4 frag_color;

`)

gl.module('phong.vs', `

	#include mesh.vs

	uniform mat4 sdm_view_proj;

	out vec4 v_pos_sdm_view_proj;

	void do_phong() {
		v_pos = vec3(model * vec4(pos, 1.0));
		v_pos_sdm_view_proj = sdm_view_proj * vec4(v_pos, 1.0);
		v_normal = inverse(transpose(mat3(model))) * normal; /* model must be affine! */
		v_uv = uv;
		gl_Position = view_proj * vec4(v_pos, 1.0);
	}

`)

gl.module('phong.fs', `

	#include mesh.fs

	uniform vec3 sunlight_pos;
	uniform vec3 sunlight_color;
	uniform float shininess;
	uniform float ambient_strength;
	uniform float specular_strength;
	uniform bool enable_shadows;
	uniform sampler2D shadow_map;

	in vec4 v_pos_sdm_view_proj;

	void do_phong() {

		float ambient = ambient_strength;

		vec3 normal = normalize(v_normal);

		vec3 light_dir = normalize(sunlight_pos - v_pos);
		float diffuse = max(dot(normal, light_dir), 0.0);

		vec3 view_dir = normalize(view_pos - v_pos);
		vec3 reflect_dir = reflect(-light_dir, normal);
		float specular = specular_strength * pow(max(dot(view_dir, reflect_dir), 0.0), shininess);

		float shadow = 0.0;
		if (enable_shadows) {

			vec3 p = v_pos_sdm_view_proj.xyz / v_pos_sdm_view_proj.w;
			p = p * 0.5 + 0.5;
			float closest_depth = texture(shadow_map, p.xy).r;
			float current_depth = p.z;
			float bias = max(0.05 * (1.0 - dot(normal, light_dir)), 0.000001);

			// PCF: soften the shadow.
			vec2 texel_size = 1.0 / vec2(textureSize(shadow_map, 0));
			for (int x = -1; x <= 1; ++x) {
				 for (int y = -1; y <= 1; ++y) {
					  float pcf_depth = texture(shadow_map, p.xy + vec2(x, y) * texel_size).r;
					  shadow += current_depth - bias > pcf_depth ? 1.0 : 0.0;
				 }
			}
			shadow /= 9.0;
		}

		float light = (ambient + (1.0 - shadow) * (diffuse + specular));

		frag_color = vec4(light * sunlight_color, 1.0) * (vec4(diffuse_color, 1.0) + texture(diffuse_map, v_uv));

	}

`)

gl.scene_renderer = function(r) {

	let gl = this

	r = r || {}

	r.background_color = r.background_color || v4(1, 1, 1, 1)
	r.sunlight_dir     = r.sunlight_dir || v3(1, 1, 0)
	r.sunlight_color   = r.sunlight_color || v3(1, 1, 1)
	r.diffuse_color    = r.diffuse_color || v3(1, 1, 1)
	r.sdm_proj         = r.sdm_proj || mat4().ortho(-10, 10, -10, 10, -1e4, 1e4)

	let sunlight_view = mat4()
	let sdm_view_proj = mat4()
	let origin = v3.origin
	let up_dir = v3.up
	let sunlight_pos = v3()

	let sdm_prog = gl.program('shadow_map', `
		#version 300 es
		uniform mat4 sdm_view_proj;
		in vec3 pos;
		in mat4 model;
		void main() {
			gl_Position = sdm_view_proj * model * vec4(pos, 1.0);
		}
	`, `
		#version 300 es
		void main() {
			// this is what the GPU does automatically:
			// gl_FragDepth = gl_FragCoord.z;
		}
	`)

	let sdm_tex = gl.texture()
	let sdm_fbo = gl.fbo()

	let sdm_res

	r.update = function() {

		sunlight_pos.set(r.sunlight_dir).set_len(FAR)
		sunlight_view.reset()
			.translate(sunlight_pos)
			.look_at(sunlight_pos, origin, up_dir)
			.invert()

		gl.set_uni('sunlight_pos', sunlight_pos)
		gl.set_uni('sunlight_color', r.sunlight_color)
		gl.set_uni('diffuse_color', r.diffuse_color)

		gl.set_uni('enable_shadows', r.enable_shadows)

		if (r.enable_shadows) {

			mat4.mul(r.sdm_proj, sunlight_view, sdm_view_proj)
			gl.set_uni('sdm_view_proj', sdm_view_proj)

			let sdm_res1 = or(r.shadow_map_resolution, 1024)
			if (sdm_res1 != sdm_res) {
				sdm_res = sdm_res1

				sdm_tex.set_depth(sdm_res, sdm_res, true)

				sdm_fbo.bind()
				sdm_fbo.attach(sdm_tex, 'depth')
				sdm_fbo.unbind()

				gl.set_uni('shadow_map', sdm_tex, 1)

			}

		}

	}

	r.render = function(draw) {

		if (r.enable_shadows) {
			// render depth of scene to sdm texture (from light's perspective).
			sdm_fbo.bind('draw', 'none')
			gl.viewport(0, 0, sdm_res, sdm_res)
			gl.clearDepth(1)
			gl.cullFace(gl.FRONT) // to get rid of peter paning.
			gl.clear(gl.DEPTH_BUFFER_BIT)
			draw(sdm_prog)
			sdm_fbo.unbind()
		}

		// 2. render scene as normal with shadow mapping (using depth map).
		let cw = gl.canvas.cw
		let ch = gl.canvas.ch
		gl.viewport(0, 0, cw, ch)
		gl.clear_all(...r.background_color)
		draw()
	}

	r.update()

	return r
}

// render-based hit testing --------------------------------------------------

gl.face_id_renderer = function(r) {

	let gl = this

	r = r || {}

	let face_id_prog = gl.program('face_id', `

		#include mesh.vs

		in uint face_id;
		in uint inst_id;

		flat out uint v_face_id;
		flat out uint v_inst_id;

		void main() {
			gl_Position = mvp(pos);
			v_face_id = face_id;
			v_inst_id = inst_id;
		}

	`, `

		#version 300 es

		precision highp float;
		precision highp int;

		flat in uint v_face_id;
		flat in uint v_inst_id;

		layout (location = 0) out uint frag_color0;
		layout (location = 1) out uint frag_color1;

		void main() {
			frag_color0 = v_face_id;
			frag_color1 = v_inst_id;
		}

	`)

	let w, h
	let face_id_map = gl.texture()
	let inst_id_map = gl.texture()
	let depth_map = gl.rbo()
	let fbo = gl.fbo()
	let face_id_arr
	let inst_id_arr

	r.render = function(draw) {
		let w1 = gl.canvas.cw
		let h1 = gl.canvas.ch
		if (w1 != w || h1 != h) {
			w = w1
			h = h1
			face_id_map.set_u32(w, h); face_id_arr = new u32arr(w * h)
			inst_id_map.set_u32(w, h); inst_id_arr = new u32arr(w * h)
			depth_map.set_depth(w, h, true)
		}
		fbo.bind('draw', ['color', 'color'])
		fbo.attach(face_id_map, 'color', 0)
		fbo.attach(inst_id_map, 'color', 1)
		fbo.attach(depth_map)
		fbo.clear_color(0, 0xffffffff)
		fbo.clear_color(1, 0xffffffff)
		gl.clear_all()
		draw(face_id_prog)
		fbo.unbind()
		fbo.read_pixels('color', 0, face_id_arr)
		fbo.read_pixels('color', 1, inst_id_arr)
	}

	r.hit_test = function(x, y, out) {
		out.inst_id = null
		out.face_id = null
		if (!face_id_arr)
			return
		if (x < 0 || x >= w || y < 0 || y >= h)
			return
		y = (h-1) - y // textures are read upside down...
		let face_id = face_id_arr[y * w + x]
		let inst_id = inst_id_arr[y * w + x]
		if (face_id == 0xffffffff || inst_id == 0xffffffff)
			return
		out.inst_id = inst_id
		out.face_id = face_id
		return true
	}

	return r

}

// instance buffers ----------------------------------------------------------

gl.instance_buffer = function() {
	//
}

// face rendering ------------------------------------------------------------

gl.faces_renderer = function() {

	let gl = this

	let e = {
		ambient_strength: 0.1,
		specular_strength: .2,
		shininess: 5,
		polygon_offset: .0001,
	}

	let prog = gl.program('face', `

		#include phong.vs

		in int selected;
		flat out int frag_selected;

		void main() {
			do_phong();
			frag_selected = selected;
		}

	`, `

		#include phong.fs

		flat in int frag_selected;

		void main() {

			do_phong();

			if (frag_selected == 1) {
				float x = mod(gl_FragCoord.x, 4.0);
				float y = mod(gl_FragCoord.y, 8.0);
				frag_color =
					((x >= 0.0 && x <= 1.1 && y >= 0.0 && y <= 0.5) ||
					 (x >= 2.0 && x <= 3.1 && y >= 4.0 && y <= 4.5))
					? vec4(0.0, 0.0, .8, 1.0) : frag_color;
			}
		}

	`)

	let vao = prog.vao()

	let draw_ranges = []

	let davb = gl.dyn_arr_vertex_buffer({
		pos      : 'v3',
		normal   : 'v3',
		uv       : 'v2',
		selected : 'i32',
		face_id  : 'u32',
	})

	let index_dab = gl.dyn_arr_index_buffer()

	let _v0 = v3()
	let _v1 = v3()
	let _uv = v2()

	e.update = function(materials) {

		let pt_n = 0
		let pi_n = 0
		for (let [mat, faces] of materials) {
			for (let face of faces) {
				face.update_if_invalid()
				pt_n += face.length
				pi_n += face.triangles().length
			}
		}

		davb.len = pt_n
		index_dab.len = 0
		index_dab.grow_type(pt_n)
		index_dab.len = pi_n

		let pos      = davb.pos      .array
		let normal   = davb.normal   .array
		let uv       = davb.uv       .array
		let selected = davb.selected .array
		let face_id  = davb.face_id  .array
		let index    = index_dab     .array

		let j = 0
		let k = 0
		draw_ranges.length = 0
		for (let [mat, faces] of materials) {
			let k0 = k
			for (let face of faces) {
				let j0 = j
				let i, n
				for (i = 0, n = face.length; i < n; i++, j++) {
					let p = face.get_point(i, _v0)
					let np = face.get_normal(i, _v1)
					let uv = face.uv_at(i, face.uvm, mat.uv, _uv)
					pos[3*j+0] = p[0]
					pos[3*j+1] = p[1]
					pos[3*j+2] = p[2]
					normal[3*j+0] = np[0]
					normal[3*j+1] = np[1]
					normal[3*j+2] = np[2]
					uv[2*j+0] = uv[0]
					uv[2*j+1] = uv[1]
					selected[j] = face.selected
					face_id[j] = face.id
				}
				let tris = face.triangles()
				for (i = 0, n = tris.length; i < n; i++, k++) {
					index[k] = j0 + tris[i]
				}
			}
			draw_ranges.push([mat, k0, k - k0])
		}

		davb.upload()
		index_dab.upload()

	}

	let vao_set = gl.vao_set()

	e.draw = function(prog) {
		gl.polygonOffset(e.polygon_offset, 0)
		if (prog) {
			let vao = vao_set.vao(prog)
			vao.use()
			vao.set_attrs(davb)
			vao.set_index(index_dab.buffer)
			vao.set_attr('model'  , e.model)
			vao.set_attr('inst_id', e.inst_id)
			gl.draw_triangles()
			vao.unuse()
		} else {
			vao.use()
			vao.set_attrs(davb)
			vao.set_index(index_dab.buffer)
			vao.set_attr('model', e.model)
			for (let [mat, offset, len] of draw_ranges) {
				vao.set_uni('ambient_strength' , or(mat.ambient_strength, e.ambient_strength))
				vao.set_uni('specular_strength', or(mat.specular_strength, e.specular_strength))
				vao.set_uni('shininess'        , 1 << or(mat.shininess, e.shininess)) // keep this a pow2.
				vao.set_uni('diffuse_color', mat.diffuse_color)
				vao.set_uni('diffuse_map'  , mat.diffuse_map)
				gl.draw_triangles(offset, len)
			}
			vao.unuse()
		}
		gl.polygonOffset(0, 0)
	}

	e.free = function() {
		vao.free()
		vao_set.free()
	}

	return e
}

// solid lines rendering -----------------------------------------------------

gl.solid_lines_renderer = function() {

	let gl = this
	let e = {
		base_color: 0x000000,
	}

	let prog = this.program('solid_line', `

		#include mesh.vs

		uniform vec3 base_color;
		in vec3 color;
		flat out vec4 v_color;

		void main() {
			gl_Position = mvp(pos);
			v_color = vec4(base_color + color, 1.0);
		}

	`, `

		#include mesh.fs

		flat in vec4 v_color;

		void main() {
			frag_color = v_color;
		}

	`)

	let vao = prog.vao()

	e.draw = function(prog) {
		if (prog)
			return // no shadows or hit-testing.
		vao.use()
		vao.set_attr('pos', e.pos)
		vao.set_attr('model', e.model)
		vao.set_index(e.index)
		vao.set_uni('base_color', e.base_color)
		vao.set_attr('color', e.color)
		gl.draw_lines()
		vao.unuse()
	}

	e.free = function() {
		vao.free()
	}

	return e

}

// solid point rendering -----------------------------------------------------

gl.points_renderer = function(e) {

	let gl = this
	e = assign({
		base_color : 0x000000,
		point_size : 4,
	}, e)

	let prog = this.program('solid_point', `

		#include mesh.vs

		uniform vec3 base_color;
		uniform float point_size;
		in vec3 color;
		flat out vec4 v_color;

		void main() {
			gl_Position = mvp(pos);
			gl_PointSize = point_size;
			v_color = vec4(base_color + color, 1.0);
		}

	`, `

		#include mesh.fs

		flat in vec4 v_color;

		void main() {
			frag_color = v_color;
		}

	`)

	let vao = prog.vao()

	e.draw = function(prog) {
		if (prog)
			return // no shadows or hit testing.
		vao.use()
		vao.set_uni('point_size', e.point_size)
		vao.set_attr('pos', e.pos)
		vao.set_attr('model', e.model)
		vao.set_index(e.index)
		vao.set_uni('base_color', e.base_color)
		vao.set_attr('color', e.color)
		gl.draw_points()
		vao.unuse()
	}

	e.free = function() {
		vao.free()
	}

	return e
}

// dashed lines rendering ----------------------------------------------------

gl.dashed_lines_renderer = function(e) {

	let gl = this
	e = assign({
		base_color: 0x000000,
		dash: 1,
		gap: 3,
	}, e)

	// works with gl.LINES drawing mode.
	let prog = this.program('dashed_line', `

		#include mesh.vs

		uniform vec3 base_color;
		in vec3 color;
		out vec4 v_p1;
		flat out vec4 v_p2; // because gl.LAST_VERTEX_CONVENTION.
		flat out vec4 v_color;

		void main() {
			vec4 p = mvp(pos);
			v_p1 = p;
			v_p2 = p;
			v_color = vec4(base_color + color, 1.0);
			gl_Position = p;
		}

	`, `

		#include mesh.fs

		uniform float dash;
		uniform float gap;

		in vec4 v_p1;
		flat in vec4 v_p2; // because GL_LAST_VERTEX_CONVENTION.
		flat in vec4 v_color;

		void main() {
			vec2 p1 = (v_p1.xyz / v_p1.w).xy;
			vec2 p2 = (v_p2.xyz / v_p2.w).xy;
			float dist = length((p1 - p2) * viewport_size.xy * 0.5);
			if (fract(dist / (dash + gap)) > dash / (dash + gap))
				discard;
			frag_color = v_color;
		}

	`)

	let vao = prog.vao()

	e.draw = function(prog) {
		if (prog)
			return // no shadows or hit-testing.
		vao.use()
		vao.set_uni('dash', e.dash)
		vao.set_uni('gap', e.gap)
		vao.set_attr('pos', e.pos)
		vao.set_attr('model', e.model)
		vao.set_index(e.index)
		vao.set_uni('base_color', e.base_color)
		vao.set_attr('color', e.color)
		gl.draw_lines()
		vao.unuse()
	}

	e.free = function() {
		vao.free()
	}

	return e

}

// fat lines rendering -------------------------------------------------------

gl.fat_lines_renderer = function(e) {

	let gl = this
	e = assign({
		base_color: 0x000000,
	}, e)

	let prog = gl.program('fat_line', `

		#include mesh.vs

		uniform float clip_near;

		in vec3 q; // line's other end-point.
		in float dir;

		vec4 shorten_line(vec4 p1, vec4 p2, float cut_w) {
			float t = (cut_w - p2.w) / (p1.w - p2.w);
			return mix(p2, p1, t);
		}

		void main() {

			// line points in NDC.
			vec4 p1 = mvp(pos);
			vec4 p2 = mvp(q);

			// cut the line at near-plane if one of its end-points has w < 0.
			float cut_w = clip_near * .5;
			if (p1.w < cut_w && p2.w > cut_w) {
				p1 = shorten_line(p1, p2, cut_w);
			} else if (p2.w < cut_w && p1.w > cut_w) {
				p2 = shorten_line(p2, p1, cut_w);
			}

			// line normal in screen space.
			vec2 s1 = p1.xy / p1.w;
			vec2 s2 = p2.xy / p2.w;
			float nx = s2.x - s1.x;
			float ny = s1.y - s2.y;
			vec2 n = normalize(vec2(ny, nx) * dir) / viewport_size * 2.0 * p1.w;

			gl_Position = p1 + vec4(n, 0.0, 0.0);

		}

	`, `

		#include mesh.fs

		uniform vec3 base_color;

		void main() {
			frag_color = vec4(base_color, 1.0);
		}

	`)

	let davb = gl.dyn_arr_vertex_buffer({pos: 'v3', q: 'v3', dir: 'i8'})
	let ib = gl.dyn_arr_index_buffer()

	e.update = function(each_line, line_count) {

		let vertex_count = 4 * line_count
		let index_count  = 6 * line_count

		davb.len = vertex_count

		ib.len = 0
		ib.grow_type(vertex_count-1)
		ib.len = index_count

		let ps = davb.pos.array
		let qs = davb.q.array
		let ds = davb.dir.array
		let is = ib.array

		let i = 0
		let j = 0
		each_line(function(line) {

			let p1x = line[0][0]
			let p1y = line[0][1]
			let p1z = line[0][2]
			let p2x = line[1][0]
			let p2y = line[1][1]
			let p2z = line[1][2]

			// each line has 4 points: (p1, p1, p2, p2).
			ps[3*(i+0)+0] = p1x
			ps[3*(i+0)+1] = p1y
			ps[3*(i+0)+2] = p1z

			ps[3*(i+1)+0] = p1x
			ps[3*(i+1)+1] = p1y
			ps[3*(i+1)+2] = p1z

			ps[3*(i+2)+0] = p2x
			ps[3*(i+2)+1] = p2y
			ps[3*(i+2)+2] = p2z

			ps[3*(i+3)+0] = p2x
			ps[3*(i+3)+1] = p2y
			ps[3*(i+3)+2] = p2z

			// each point has access to its opposite point, so (p2, p2, p1, p1).
			qs[3*(i+0)+0] = p2x
			qs[3*(i+0)+1] = p2y
			qs[3*(i+0)+2] = p2z

			qs[3*(i+1)+0] = p2x
			qs[3*(i+1)+1] = p2y
			qs[3*(i+1)+2] = p2z

			qs[3*(i+2)+0] = p1x
			qs[3*(i+2)+1] = p1y
			qs[3*(i+2)+2] = p1z

			qs[3*(i+3)+0] = p1x
			qs[3*(i+3)+1] = p1y
			qs[3*(i+3)+2] = p1z

			// each point has an alternating normal direction.
			ds[i+0] =  1
			ds[i+1] = -1
			ds[i+2] = -1
			ds[i+3] =  1

			// each line is made of 2 triangles (0, 1, 2) and (1, 3, 2).
			is[j+0] = i+0
			is[j+1] = i+1
			is[j+2] = i+2
			is[j+3] = i+1
			is[j+4] = i+3
			is[j+5] = i+2

			i += 4
			j += 6
		})

		davb.upload()
		ib.upload()
	}

	let vao = prog.vao()

	e.draw = function(prog) {
		if (prog)
			return // no shadows or hit-testing
		vao.use()
		vao.set_attrs(davb)
		vao.set_attr('model', e.model)
		vao.set_index(ib.buffer)
		vao.set_uni('base_color', e.base_color)
		vao.set_attr('color', e.color)
		gl.draw_triangles()
		vao.unuse()
	}

	e.free = function() {
		vao.free()
		davb.free()
		pb.free()
		qb.free()
		db.free()
		ib.free()
	}

	return e
}

// parametric geometry generators --------------------------------------------

{
	let pos_template = new f32arr([
		-.5,  -.5,  -.5,
		 .5,  -.5,  -.5,
		 .5,   .5,  -.5,
		-.5,   .5,  -.5,
		-.5,  -.5,   .5,
		 .5,  -.5,   .5,
		 .5,   .5,   .5,
		-.5,   .5,   .5,
	])

	let triangle_pis = new u8arr([
		3, 2, 1,  1, 0, 3,
		6, 7, 4,  4, 5, 6,
		2, 3, 7,  7, 6, 2,
		1, 5, 4,  4, 0, 1,
		7, 3, 0,  0, 4, 7,
		2, 6, 5,  5, 1, 2,
	])

	triangle_pis.max_index = pos_template.length - 1

	let len = 6 * 3 * 2
	let pos = new f32arr(len * 3)

	gl.box_geometry = function() {

		let pos = new f32arr(pos_template.length)
		pos.n_components = 3

		let e = {
			pos: pos,
			index: triangle_pis,
			len: len,
		}

		e.set = function(xd, yd, zd) {
			for (let i = 0; i < len * 3; i += 3) {
				pos[i+0] = pos_template[i+0] * xd
				pos[i+1] = pos_template[i+1] * yd
				pos[i+2] = pos_template[i+2] * zd
			}
			return this
		}

		return e
	}
}

// skybox prop ---------------------------------------------------------------

gl.skybox = function(opt) {

	let gl = this
	let e = {}
	events_mixin(e)

	let prog = gl.program('skybox', `

		#include mesh.vs

		out vec3 v_model_pos;

		void main() {
			v_model_pos = pos.xyz;
			gl_Position = mvp(pos);
		}

	`, `

		#include mesh.fs

		uniform vec3 sky_color;
		uniform vec3 horizon_color;
		uniform vec3 ground_color;
		uniform float exponent;
		uniform bool use_difuse_cube_map;

		uniform samplerCube diffuse_cube_map;

		in vec3 v_model_pos;

		void main() {
			float h = normalize(v_model_pos).y;
			frag_color = vec4(
				mix(
					mix(horizon_color, sky_color * texture(diffuse_cube_map, v_model_pos).xyz, pow(max(h, 0.0), exponent)),
					ground_color,
					1.0-step(0.0, h)
			), 1.0);
		}

	`)

	let geo = gl.box_geometry().set(1, 1, 1)
	let vao = prog.vao()
	let pos_buf = gl.buffer(geo.pos)
	let model = mat4f32().scale(FAR)
	let inst_buf = gl.mat4_instance_buffer(model)
	let index_buf = gl.index_buffer(geo.index)
	vao.set_attr('pos', pos_buf)
	vao.set_attr('model', inst_buf)
	vao.set_index(index_buf)

	let cube_map_tex

	e.update_view = function(view_pos) {
		model.reset().set_position(view_pos).scale(FAR * 2)
		inst_buf.upload(model, 0)
	}

	e.update = function() {

		vao.set_uni('sky_color', e.sky_color || 0xccddff)
		vao.set_uni('horizon_color', e.horizon_color || 0xffffff)
		vao.set_uni('ground_color', e.ground_color || 0xe0dddd)
		vao.set_uni('exponent', or(e.exponent, 1))

		let n_loaded
		let on_load = function() {
			n_loaded++
			if (n_loaded == 6) {
				vao.set_uni('use_difuse_cube_map', true)
				e.fire('load')
			}
		}
		if (e.images && !e.loaded) {
			e.loaded = true
			cube_map_tex = cube_map_tex || gl.texture('cubemap')
			cube_map_tex.set_wrap('clamp', 'clamp')
			cube_map_tex.set_filter('linear', 'linear')
			vao.set_uni('diffuse_cube_map', cube_map_tex)
			vao.set_uni('use_difuse_cube_map', false)
			n_loaded = 0
			for (let side in e.images) {
				let img = e.images[side]
				if (isstr(img))
					cube_map_tex.load(img, 1, on_load, side)
				else
					cube_map_tex.set_image(image, 1, on_load)
			}
		}

	}

	e.draw = function(prog) {
		if (prog)
			return // no shadows or hit-testing
		vao.use()
		gl.draw_triangles()
		vao.unuse()
	}

	assign(e, opt)
	e.update()

	return e
}

// texture quad prop ---------------------------------------------------------

gl.texture_quad = function(tex, imat) {
	let gl = this

	let quad = poly3({mode: 'flat'}, [
		-1, -1, 0,
		 1, -1, 0,
		 1, 1, 0,
		-1, 1, 0
	])

	let uvs = quad.uvs(null, v2(.5, .5))
	let tris = quad.triangulate()
	imat = imat || mat4f32()

	let pos = gl.v3_buffer(quad)
	let uv = gl.v2_buffer(uvs)
	let index = gl.index_buffer(tris)
	let model = gl.mat4_instance_buffer(imat)

	let pr = gl.program('texture_quad_prop', `
		#include mesh.vs
		out vec2 v_uv;
		void main() {
			v_uv = uv;
			gl_Position = mvp(pos);
		}
	`, `
		#include mesh.fs
		in vec2 v_uv;
		void main() {
			frag_color = vec4(vec3(texture(diffuse_map, v_uv).r), 1.0);
		}
	`)

	let vao = pr.vao()
	vao.bind()
	vao.set_attr('pos', pos)
	vao.set_attr('uv', uv)
	vao.set_attr('model', model)
	vao.set_index(index)
	vao.set_uni('diffuse_map', tex)
	vao.unbind()

	quad.draw = function() {
		vao.use()
		gl.draw_triangles()
		vao.unuse()
	}

	quad.free = function() {
		vao.free()
		pos.free()
		index.free()
		uv.free()
		model.free()
	}

	quad.model = imat
	quad.update_model = function() {
		model.update(imat, 0, model.n_components)
	}

	return quad
}

// axes prop -----------------------------------------------------------------

gl.axes_renderer = function(opt) {
	let gl = this
	let e = assign({
		x_color: 0x990000,
		y_color: 0x000099,
		z_color: 0x006600,
	}, opt)

	let lines_r = gl.solid_lines_renderer()
	let dashed_r = gl.dashed_lines_renderer()

	let pos_poz = [
		...v3.zero, ...v3(FAR,   0,   0),
		...v3.zero, ...v3(  0, FAR,   0),
		...v3.zero, ...v3(  0,   0, FAR),
	]
	pos_poz = gl.v3_buffer(pos_poz)

	let pos_neg = [
		...v3.zero, ...v3(-FAR,    0,    0),
		...v3.zero, ...v3(   0, -FAR,    0),
		...v3.zero, ...v3(   0,    0, -FAR),
	]
	pos_neg = gl.v3_buffer(pos_neg)

	let color = [
		...v3().from_rgb(e.x_color),
		...v3().from_rgb(e.x_color),
		...v3().from_rgb(e.y_color),
		...v3().from_rgb(e.y_color),
		...v3().from_rgb(e.z_color),
		...v3().from_rgb(e.z_color),
	]
	color = gl.v3_buffer(color)

	let model = gl.dyn_mat4_instance_buffer()

	e.add_instance = function() {
		let i = model.len
		model.len = i+1
		e.upload_model(i, mat4f32())
		lines_r.model = model.buffer
		dashed_r.model = model.buffer
		return i
	}

	e.upload_model = function(i, m) {
		model.buffer.upload(m, i)
	}

	lines_r.pos = pos_poz
	lines_r.color = color

	dashed_r.pos = pos_neg
	dashed_r.color = color

	e.draw = function(prog) {
		lines_r.draw(prog)
		dashed_r.draw(prog)
	}

	return e
}

}()) // module scope.
