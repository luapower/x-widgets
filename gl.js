/*

	WebGL 1 & 2 wrapper.
	Written by Cosmin Apreutesei.

*/

{

// gl context and extensions -------------------------------------------------

let gl = {DEBUG: true}

gl.isv2 = function() {
	return this instanceof WebGL2RenderingContext
}

gl.enable_32bit_indices = function() {
	assert(this.getExtension('OES_element_index_uint'))
	this.enable_32bit_indices = noop
}

gl.enable_instancing = function() {
	let gl = this
	if (!gl.isv2()) {
		let ext = assert(gl.getExtension('ANGLE_instanced_arrays'))
		gl.vertexAttribDivisor = (i, d) => ext.vertexAttribDivisorANGLE(i, d)
		gl.drawArraysInstanced = (mode, first, count, n) => ext.drawArraysInstancedAngle(mode, first, count, n)
		gl.drawElementsInstanced = (mode, count, type, offset, n) => ext.drawElementsInstancedANGLE(mode, count, type, offset, n)
	}
	gl.enable_instancing = noop
}

gl.enable_vao = function() {
	let gl = this
	if (!gl.isv2()) {
		let ext = assert(gl.getExtension('OES_vertex_array_object'))
		gl.createVertexArray = () => ext.createVertexArrayOES()
		gl.bindVertexArray = (vao) => ext.bindVertexArrayOES(vao)
	}
	gl.enable_vao = noop
}

gl.enable_depth_textures = function() {
	let gl = this
	if (!gl.isv2())
		assert(gl.getExtension('WEBGL_depth_texture'))
	gl.enable_depth_textures = noop
}

gl.clear_all = function(r, g, b, a) {
	let gl = this
	gl.clearColor(r, g, b, or(a, 1))
	gl.clear(gl.COLOR_BUFFER_BIT)
	gl.clearDepth(1.0)
	gl.enable(gl.DEPTH_TEST)
	gl.depthFunc(gl.LEQUAL)
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
	gl.enable(gl.POLYGON_OFFSET_FILL)
	return this
}

// shaders & VAOs ------------------------------------------------------------

let outdent = function(s) {
	s = s
		.replaceAll('\r', '')
		// trim line ends.
		.replaceAll(/[\t ]+\n/g, '\n')
		.replace(/[\t ]+$/, '')
		// trim text of empty lines.
		.replace(/^\n+/, '')
		.replace(/\n+$/, '')
	let indent = s.match(/^[\t ]*/)[0]
	return s.replace(indent, '').replaceAll('\n'+indent, '\n')
}

gl.module = function(name, s) {
	attr(this, 'includes')[name] = outdent(s)
}

let preprocess = function(gl, code, included) {
	return ('\n' + outdent(code))
		.replaceAll(/\n#include[ \t]+([^\n]+)/g, function(_, name) {
			if (included[name])
				return ''
			included[name] = true
			let inc_code = attr(gl, 'includes')[name]
			assert(inc_code, 'include not found: {0}', name)
			return '\n'+preprocess(gl, inc_code, included)+'\n'
		}).replace(/^\n/, '')
}

gl.shader = function(type, name, gl_type, code) {
	let gl = this

	let shader = gl.createShader(gl_type)
	code = preprocess(gl, code, {})
	gl.shaderSource(shader, code)
	gl.compileShader(shader)

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		print(gl.getShaderInfoLog(shader))
		print()
		print(code)
		gl.deleteShader(shader)
		assert(false, '{0} shader {1} compilation failed', type, name)
	}

	return shader
}

let prog = {}

gl.program = function(name, vs_code, fs_code) {
	let gl = this

	let vs = gl.shader('vertex'  , name, gl.VERTEX_SHADER  , vs_code)
	let fs = gl.shader('fragment', name, gl.FRAGMENT_SHADER, fs_code)
	let pr = gl.createProgram()
	gl.attachShader(pr, vs)
	gl.attachShader(pr, fs)
	gl.linkProgram(pr)
	gl.validateProgram(pr)

	if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
		print(gl.getProgramInfoLog(pr))
		print('VERTEX SHADER')
		print(vs_code)
		print('FRAGMENT SHADER')
		print(fs_code)
		gl.deleteProgram(pr)
		gl.deleteShader(vs)
		gl.deleteShader(fs)
		assert(false, '{0} program linking failed', name)
	}

	pr.uniform_count = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS)
	pr.uniform_info = {}
	for (let i = 0, n = pr.uniform_count; i < n; i++) {
		let info = gl.getActiveUniform(pr, i)
		pr.uniform_info[info.name] = info
	}

	pr.gl = gl
	pr.vs = vs
	pr.fs = fs
	pr.name = name

	gl.programs = gl.programs || []
	gl.programs.push(pr)

	return pr
}

prog.use = function(vao) {
	let gl = this.gl
	if (gl.active_program == this)
		return
	gl.useProgram(this)
	if (!vao) {
		vao = this.default_vao
		if (!vao) {
			vao = this.vao()
			this.default_vao = vao
		}
	} else {
		assert(vao.program == this, 'VAO not of this program ({0})', this.name)
	}
	gl.bindVertexArray(vao)
	gl.active_vao = vao
	gl.active_program = this

	// set global uniforms.
	if (gl.uniforms)
		for (let name in gl.uniforms) {
			let u = gl.uniforms[name]
			if (!this.initialized || u.changed) {
				this.set_uni(name, ...u.args)
			}
		}

	this.initialized = true
	return this
}

prog.free = function() {
	let pr = this
	let gl = pr.gl
	for (let vao of this.vaos)
		gl.deleteVertexArray(vao)
	if (gl.active_program == this)
		gl.useProgram(null)
	gl.programs.remove_value(pr)
	gl.deleteProgram(pr)
	gl.deleteShader(pr.vs)
	gl.deleteShader(pr.fs)
	this.free = noop
}

let vao = {}

prog.vao = function() {
	let gl = this.gl
	gl.enable_vao()
	let vao = gl.createVertexArray()
	vao.program = this
	vao.gl = gl
	if (!this.vaos)
		this.vaos = []
	this.vaos.push(vao)
	return vao
}

vao.free = function() {
	this.gl.deleteVertexArray(this)
	this.program.vaos.remove_value(this)
	this.free = noop
}

// VBOs ----------------------------------------------------------------------

gl.buffer = function(data_or_cap, array_type, n_components, instance_divisor, normalize, for_index) {
	assert(instance_divisor == null || instance_divisor == 1, 'NYI')
	let gl = this
	let b = gl.createBuffer()
	let capacity = isnum(data_or_cap) ? data_or_cap : data_or_cap.length
	b.gl_target = for_index && gl.ELEMENT_ARRAY_BUFFER || gl.ARRAY_BUFFER
	gl.bindBuffer(b.gl_target, b)
	gl.bufferData(b.gl_target, data_or_cap, gl.STATIC_DRAW)
	b.capacity = capacity
	b.length = isnum(data_or_cap) ? 0 : capacity
	array_type = array_type || data_or_cap.constructor
	b.gl_type =
		   array_type ==  f32arr && gl.FLOAT
		|| array_type ==   u8arr && gl.UNSIGNED_BYTE
		|| array_type ==  u16arr && gl.UNSIGNED_SHORT
		|| array_type ==  u32arr && gl.UNSIGNED_INT
		|| array_type ==   i8arr && gl.BYTE
		|| array_type ==  i16arr && gl.SHORT
		|| array_type ==  i32arr && gl.INT
		|| assert(false, 'unsupported array type {0}', array_type.name)
	b.gl = gl
	b.n_components = n_components
	b.instance_divisor = instance_divisor
	b.normalize = normalize || false
	if (b.instance_divisor != null)
		gl.enable_instancing()
	return b
}

gl.index_buffer = function(data_or_cap, array_type) {
	return this.buffer(data_or_cap, array_type, 1, null, false, true)
}

let buf = {}

buf.update = function(data, offset, len) {
	let b = this
	let gl = this.gl
	offset = offset || 0
	len = len != null ? len : data.length
	gl.bindBuffer(b.gl_target, b)
	let bs = data.BYTES_PER_ELEMENT
	if (gl.isv2()) {
		gl.bufferSubData(b.gl_target, offset * bs, data, offset, len)
	} else {
		gl.bufferSubData(b.gl_target, offset * bs, data.subarray(offset, len))
	}
	b.length = max(b.length, offset + len)
	return this
}

buf.free = function() {
	gl.deleteBuffer(this)
	this.free = noop
}

gl.dyn_buffer = function(array_type, data_or_cap,
	n_components, instance_divisor, normalize, for_index
) {
	let gl = this
	let db = {length: 0, gl: gl}
	let b = null
	let invalid
	let invalid_o1
	let invalid_o2

	db.grow_type = function(array_type1) {
		if (array_type1 == array_type || array_type1.BYTES_PER_ELEMENT <= array_type.BYTES_PER_ELEMENT)
			return
		array_type = array_type1
		if (db.array)
			db.array = new array_type(db.array)
		if (b) {
			b.free()
			b = null
		}
	}

	// NOTE: the `capacity` arg is couting vertices, not elements.
	db.grow = function(data_or_cap, clear) {
		let a = db.array
		let cap0 = a ? a.length : 0
		let cap
		if (!isnum(data_or_cap)) { // (re)init
			cap = data_or_cap.length
			let data = data_or_cap
			if (isarray(data)) {
				data = new array_type(data_or_cap)
				if (a && !clear)
					data.set(db.array)
			} else {
				assert(data instanceof array_type,
					'type mismatch {0}, expected {1}', data.constructor.name, array_type)
			}
			db.array = data
			db.length = cap
			invalid = true
			invalid_o1 = 0
			invalid_o2 = cap
		} else {
			cap = data_or_cap * n_components
			if (clear)
				db.length = 0
			if (cap0 < cap) { // grow
				cap = a ? nextpow2(cap) : cap // first time make it fit.
				db.array = new array_type(cap)
				if (a && !clear)
					db.array.set(a)
			}
		}
		if (b && cap0 < cap) { // too small
			b.free()
			b = null
		}
		return db
	}

	db.free = function() {
		if (!b) return
		b.free()
		b = null
	}

	db.buffer = function() {
		if (!b) {
			b = gl.buffer(db.array, array_type, n_components, instance_divisor, normalize, for_index)
		} else if (invalid) {
			b.update(db.array, invalid_o1, invalid_o2 - invalid_o1)
		}
		b.length = db.length
		invalid = false
		invalid_o1 = null
		invalid_o2 = null
		return b
	}

	// NOTE: `offset` and `len` args are counting vertices, not elements.
	db.invalidate = function(offset, len) {
		let o1 = or(offset, 0) * n_components
		assert(o1 >= 0, 'out of range')
		len = or(len, 1/0) * n_components
		let cap = db.array.length
		let o2 = min(o1 + len, cap)
		o1 = min(or(invalid_o1,  1/0), o1)
		o2 = max(or(invalid_o2, -1/0), o2)
		invalid = true
		invalid_o1 = o1
		invalid_o2 = o2
		db.length = max(o2, db.length)
		return db
	}

	if (n_components) {

		db.get = function get(i, out) {
			assert(i >= 0, 'out of range')
			assert(db.length >= n_components * (i + 1), 'out of range')
			out.from_array(this.array, n_components * i)
			return out
		}

		db.set = function set(i, v) {
			assert(i >= 0, 'out of range')
			db.grow(i + 1)
			v.to_array(this.array, n_components * i)
			db.invalidate(i, 1)
			return db
		}

	}

	if (data_or_cap != null)
		db.grow(data_or_cap)

	db.n_components = n_components

	return db
}

let buffer_func = function(array_type, n_components) {
	return function dyn_buffer(data_or_cap, instance_divisor) {
		return this.dyn_buffer(array_type, data_or_cap, n_components, instance_divisor)
	}
}
gl.dyn_f32_buffer  = buffer_func(f32arr,  1)
gl.dyn_u8_buffer   = buffer_func(u8arr ,  1)
gl.dyn_u16_buffer  = buffer_func(u16arr,  1)
gl.dyn_u32_buffer  = buffer_func(u32arr,  1)
gl.dyn_i8_buffer   = buffer_func(i8arr ,  1)
gl.dyn_i16_buffer  = buffer_func(i16arr,  1)
gl.dyn_i32_buffer  = buffer_func(i32arr,  1)
gl.dyn_v2_buffer   = buffer_func(f32arr,  2)
gl.dyn_v3_buffer   = buffer_func(f32arr,  3)
gl.dyn_v4_buffer   = buffer_func(f32arr,  4)
gl.dyn_mat3_buffer = buffer_func(f32arr,  9)
gl.dyn_mat4_buffer = buffer_func(f32arr, 16)
gl.dyn_mat4_instance_buffer = function(data_or_cap) {
	return this.dyn_mat4_buffer(data_or_cap, 1)
}

gl.index_array_type = function(data_or_max_idx) {
	let max_idx = data_or_max_idx
	if (isarray(data_or_max_idx)) {
		max_idx = 0
		for (let idx of data_or_max_idx)
			max_idx = max(max_idx, idx)
	}
	return max_idx > 65535 && u32arr || max_idx > 255 && u16arr || u8arr
}

gl.dyn_index_buffer = function(data_or_cap, array_type) {
	let gl = this
	if (!array_type) {
		assert(isarray(data_or_cap), 'array type required')
		array_type = gl.index_array_type(data_or_cap)
	}
	if (array_type == u32arr)
		gl.enable_32bit_indices()
	return this.dyn_buffer(array_type, data_or_cap, 1, null, false, true)
}

// setting uniforms and attributes and drawing -------------------------------

prog.uniform_location = function(name) {
	let t = attr(this, 'uniform_locations')
	let loc = t[name]
	if (!loc) {
		loc = this.gl.getUniformLocation(this, name)
		if (!loc)
			return
		t[name] = loc
	}
	return loc
}

prog.attr_location = function(name) {
	let t = attr(this, 'attr_locations')
	let loc = t[name]
	if (loc == null) {
		loc = this.gl.getAttribLocation(this, name)
		if (loc == -1)
			return
		t[name] = loc
	}
	return loc
}

prog.set_index = function(b) {
	let gl = this.gl
	let vao = gl.active_vao
	assert(vao && vao.program == this, 'program not active')
	if (vao.index_buffer != b) {
		vao.index_buffer = b
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b)
	}
	return this
}

prog.set_attr = function(name, b) {
	let gl = this.gl
	let vao = gl.active_vao
	assert(vao && vao.program == this, 'not the active program')
	let t = attr(vao, 'buffers')
	let b0 = t[name]
	if (b0 != b) {
		let loc = this.attr_location(name)
		if (loc == null)
			return this
		gl.bindBuffer(gl.ARRAY_BUFFER, b)
		if (b.n_components == 16 && b.gl_type == gl.FLOAT) { // mat4
			assert(!b.normalize)
			gl.vertexAttribPointer(loc+0, 4, gl.FLOAT, false, 64,  0)
			gl.vertexAttribPointer(loc+1, 4, gl.FLOAT, false, 64, 16)
			gl.vertexAttribPointer(loc+2, 4, gl.FLOAT, false, 64, 32)
			gl.vertexAttribPointer(loc+3, 4, gl.FLOAT, false, 64, 48)
			if (b.instance_divisor != null) {
				gl.vertexAttribDivisor(loc+0, b.instance_divisor)
				gl.vertexAttribDivisor(loc+1, b.instance_divisor)
				gl.vertexAttribDivisor(loc+2, b.instance_divisor)
				gl.vertexAttribDivisor(loc+3, b.instance_divisor)
			}
			gl.enableVertexAttribArray(loc+0)
			gl.enableVertexAttribArray(loc+1)
			gl.enableVertexAttribArray(loc+2)
			gl.enableVertexAttribArray(loc+3)
		} else if (b.n_components == 9 && b.gl_type == gl.FLOAT) { // mat3
			assert(!b.normalize)
			gl.vertexAttribPointer(loc+0, 3, gl.FLOAT, false, 36,  0)
			gl.vertexAttribPointer(loc+1, 3, gl.FLOAT, false, 36, 12)
			gl.vertexAttribPointer(loc+2, 3, gl.FLOAT, false, 36, 24)
			if (b.instance_divisor != null) {
				gl.vertexAttribDivisor(loc+0, b.instance_divisor)
				gl.vertexAttribDivisor(loc+1, b.instance_divisor)
				gl.vertexAttribDivisor(loc+2, b.instance_divisor)
			}
			gl.enableVertexAttribArray(loc+0)
			gl.enableVertexAttribArray(loc+1)
			gl.enableVertexAttribArray(loc+2)
		} else {
			gl.vertexAttribPointer(loc, b.n_components, b.gl_type, b.normalize, 0, 0)
			if (b.instance_divisor != null)
				gl.vertexAttribDivisor(loc, b.instance_divisor)
			gl.enableVertexAttribArray(loc)
		}
		t[name] = b
	}

	if (b.instance_divisor != null) {
		let n0 = vao.instance_count
		let n1 = b.length / b.n_components
		if (n0 == null)
			vao.instance_count = n1
		else
			assert(n1 == n0, 'different instance count for {0}: {1}, was {2}', name, n1, n0)
	} else {
		let n0 = vao.vertex_count
		let n1 = b.length / b.n_components
		if (n0 == null)
			vao.vertex_count = n1
		else
			assert(n1 == n0, 'different vertex count for {0}: {1}, was {2}', name, n1, n0)
	}
	return this
}

prog.set_uni_f = function(name, v) {
	let loc = this.uniform_location(name)
	if (loc)
		this.gl.uniform1f(loc, v)
	return this
}

prog.set_uni_i = function(name, v) {
	let loc = this.uniform_location(name)
	if (loc)
		this.gl.uniform1i(loc, v)
	return this
}

prog.set_uni_v2 = function(name, x, y) {
	let loc = this.uniform_location(name)
	if (loc) {
		if (x.is_v2 || x.is_v3 || x.is_v4) {
			let p = x
			x = p.x
			y = p.y
		}
		this.gl.uniform2f(loc, x, y)
	}
	return this
}

prog.set_uni_v3 = function(name, x, y, z) {
	let loc = this.uniform_location(name)
	if (loc) {
		if (x.is_v3 || x.is_v4) {
			let p = x
			x = p.x
			y = p.y
			z = p.z
		} else if (isnum(x) && y == null) { // 0xRRGGBB -> (r, g, b)
			let c = x
			x = (c >> 16 & 0xff) / 255
			y = (c >>  8 & 0xff) / 255
			z = (c       & 0xff) / 255
		}
		this.gl.uniform3f(loc, x, y, z)
	}
	return this
}

prog.set_uni_v4 = function(name, x, y, z, w) {
	let loc = this.uniform_location(name)
	if (loc) {
		if (x.is_v3 || x.is_v4) {
			let p = x
			x = p.x
			y = p.y
			z = p.z
			w = or(p.w, 1)
		} else if (isnum(x) && y == null) { // 0xRRGGBBAA -> (r, g, b, a)
			let c = x
			x = (c >> 24        ) / 255
			y = (c >> 16 & 0xff) / 255
			z = (c >>  8 & 0xff) / 255
			w = (c       & 0xff) / 255
		}
		this.gl.uniform4f(loc, x, y, z, w)
	}
	return this
}

prog.set_uni_mat3 = function(name, m) {
	let loc = this.uniform_location(name)
	if (loc)
		this.gl.uniformMatrix3fv(loc, false, m)
	return this
}

prog.set_uni_mat4 = function(name, m) {
	let loc = this.uniform_location(name)
	if (loc)
		this.gl.uniformMatrix4fv(loc, false, m)
	return this
}

prog.set_uni_texture = function(name, tex, unit) {
	let loc = this.uniform_location(name)
	if (loc) {
		let gl = this.gl
		gl.activeTexture(gl.TEXTURE0 + (unit || 0))
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.uniform1i(loc, unit || 0)
	}
	return this
}

prog.set_uni = function(name, a, b, c, d) {
	let gl = this.gl
	let info = this.uniform_info[name]
	if (!info)
		return this
	if (info.type == gl.FLOAT)
		return this.set_uni_f(name, a)
	else if (info.type == gl.INT || info.type == gl.BOOL)
		return this.set_uni_i(name, a)
	else if (info.type == gl.FLOAT_VEC2)
		return this.set_uni_v2(name, a, b)
	else if (info.type == gl.FLOAT_VEC3)
		return this.set_uni_v3(name, a, b, c)
	else if (info.type == gl.FLOAT_VEC4)
		return this.set_uni_v4(name, a, b, c, d)
	else if (info.type == gl.FLOAT_MAT3)
		return this.set_uni_mat3(name, a)
	else if (info.type == gl.FLOAT_MAT4)
		return this.set_uni_mat4(name, a)
	else if (info.type == gl.SAMPLER_2D)
		return this.set_uni_texture(name, a)
	else
		assert(false, 'unknown uniform type for {0}', name)
}

gl.set_uni = function(name, ...args) {
	let u = attr(attr(this, 'uniforms'), name)
	u.changed = true
	u.args = args
}

gl.end_frame = function() {
	let gl = this
	if (gl.uniforms)
		for (let name in gl.uniforms)
			gl.uniforms[name].changed = false
}

gl.draw = function(gl_mode) {
	let gl = this
	let vao = gl.active_vao
	let b = vao.index_buffer
	let inst_n = vao.instance_count
	if (b) { // indexed drawing.
		if (inst_n != null) {
			gl.drawElementsInstanced(gl_mode, b.length, b.gl_type, 0, inst_n)
		} else {
			gl.drawElements(gl_mode, b.length, b.gl_type, 0)
		}
	} else {
		if (inst_n != null) {
			gl.drawArraysInstanced(gl_mode, 0, vao.vertex_count, inst_n)
		} else {
			gl.drawArrays(gl_mode, 0, vao.vertex_count)
		}
	}
	return this
}

gl.draw_triangles = function() { let gl = this; return gl.draw(gl.TRIANGLES) }
gl.draw_points    = function() { let gl = this; return gl.draw(gl.POINTS   ) }
gl.draw_lines     = function() { let gl = this; return gl.draw(gl.LINES    ) }

// textures ------------------------------------------------------------------

let is_pow2 = function(value) {
	return (value & (value - 1)) == 0
}

let missing_pixel = new u8arr([0, 0, 255, 255])

gl.load_texture = function(url, pixel_scale, on_load) {
	let gl = this
	let tex = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, tex)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, missing_pixel)

	let image = new Image()
	image.crossOrigin = ''
	image.onload = function() {
		gl.bindTexture(gl.TEXTURE_2D, tex)
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
		if (!gl.isv2() && (!is_pow2(image.width) || !is_pow2(image.height))) {
			// turn off mips and set wrapping to clamp to edge.
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
		} else {
			gl.generateMipmap(gl.TEXTURE_2D)
		}
		pixel_scale = or(pixel_scale, 1)
		tex.uv = v2(
			1 / (image.width * pixel_scale),
			1 / (image.height * pixel_scale)
		)
		tex.loaded = true
		if (on_load)
			on_load(tex)
	}
	image.src = url
	tex.image = image
	return tex
}

// FBOs ----------------------------------------------------------------------

let fbo = {}

gl.fbo = function() {
	let fbo = this.createFramebuffer()
	fbo.gl = this
	return fbo
}

fbo.bind = function() {
	this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this)
}

fbo.unbind = function() {
	this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null)
}

// phong lighting ------------------------------------------------------------

// based on tutorials from learnopengl.com.

gl.module('base.vs', `

	#version 300 es

	uniform mat4 view;
	uniform mat4 proj;
	uniform mat4 view_proj;
	uniform vec2 screen_size;

	in mat4 model;
	in vec3 pos;
	in vec3 normal;
	in vec2 uv;

`)

gl.module('base.fs', `

	#version 300 es

	precision highp float;

	uniform vec2 screen_size;

	out vec4 frag_color;

`)

gl.module('phong.vs', `

	#include base.vs

	out vec3 frag_pos;
	out vec3 frag_normal;
	out vec2 frag_uv;

	void phong() {
		frag_pos = vec3(model * vec4(pos, 1.0));
		frag_normal = inverse(transpose(mat3(model))) * normal;
		frag_uv = uv;
		gl_Position = view_proj * vec4(frag_pos, 1.0);
	}

`)

gl.module('phong.fs', `

	#include base.fs

	uniform vec3 view_pos;
	uniform vec3 sunlight_pos;
	uniform vec3 sunlight_color;
	uniform float shininess;
	uniform float ambient_strength;
	uniform float specular_strength;

	uniform vec4 diffuse_color;
	uniform sampler2D diffuse_map;

	in vec3 frag_pos;
	in vec3 frag_normal;
	in vec2 frag_uv;

	float shadow = 0.0;

	void phong() {

		float ambient = ambient_strength;

		vec3 normal = normalize(frag_normal);
		vec3 light_dir = normalize(sunlight_pos - frag_pos);
		float diffuse = max(dot(normal, light_dir), 0.0);

		vec3 view_dir = normalize(view_pos - frag_pos);
		vec3 reflect_dir = reflect(-light_dir, normal);
		float specular = specular_strength * pow(max(dot(view_dir, reflect_dir), 0.0), shininess);

		float light = (ambient + (1.0 - shadow) * (diffuse + specular));

		frag_color = vec4(light * sunlight_color, 1.0) * diffuse_color * texture(diffuse_map, frag_uv);

	}

`)

// shadow mapping ------------------------------------------------------------

gl.module('shadows.vs', `

	#include phong.vs

	uniform mat4 light_view_proj;

	out vec4 frag_pos_light_view_proj;

	void shadows() {
		frag_pos_light_view_proj = light_view_proj * vec4(frag_pos, 1.0);
	}

`)

gl.module('shadows.fs', `

	#include phong.fs

	uniform sampler2D shadow_map;

	vec4 frag_pos_light_view_proj;

	void shadows() {
		vec3 p = frag_pos_light_view_proj.xyz / frag_pos_light_view_proj.w;
		p = p * 0.5 + 0.5;
		float closest_depth = texture(shadow_map, p.xy).r;
		float current_depth = p.z;
		shadow = current_depth > closest_depth ? 1.0 : 0.0;
	}

`)

gl.shadow_map = function(opt) {
	let gl = this
	gl.enable_depth_textures()

	let w = opt.w || 1024
	let h = opt.h || 1024

	// render scene to depth map ----------------------------------------------

	let depth_map = gl.createTexture()
	gl.bindTexture(gl.TEXTURE_2D, depth_map)
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24,
             w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)

	let fbo = gl.fbo()
	gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)

	// attach tex as fbo's depth buffer.
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth_map, 0)
	// disable rendering actual pixels.
	gl.drawBuffers([gl.NONE])
	gl.readBuffer(gl.NONE)

	gl.bindFramebuffer(gl.FRAMEBUFFER, null)

	let light_proj = mat4()
	let light_view = mat4()

	let near_plane = opt.near_plane || 0.0001
	let far_plane  = opt.far_plane || 1000
	let sunlight_pos = opt.sunlight_pos || v3(0, 1000, 0)

	let scene_center = v3(0, 0, 0)
	let up_dir = v3(0, 1, 0)
	let light_view_proj = mat4()

	light_proj.ortho(-10, 10, 10, -10, near_plane, far_plane)

	let depth_map_vs = `
		#version 300 es
		in vec3 pos;
		uniform mat4 light_view_proj;
		uniform mat4 model;
		void main() {
			 gl_Position = light_view_proj * model * vec4(pos, 1.0);
		}
	`

	let depth_map_fs = `
		#version 300 es
		void main() {
			// this is what the GPU does automatically:
			// gl_FragDepth = gl_FragCoord.z;
		}
	`

	let depth_map_prog = gl.program('depth_map', depth_map_vs, depth_map_fs)

	depth_map.sunlight_pos = sunlight_pos

	depth_map.render = function() {

		light_view.look_at(this.sunlight_pos, scene_center, up_dir)
		light_view_proj.mul(light_proj, light_view, mat4())

		// 1. render depth of scene to texture (from light's perspective).
		depth_map_prog.use()
		depth_map_prog.set_uni('light_view_proj', light_view_proj)
		gl.viewport(0, 0, w, h)
		fbo.bind()
		gl.clear(gl.DEPTH_BUFFER_BIT)
		opt.draw_scene(true)
		fbo.unbind()

		// 2. render scene as normal with shadow mapping (using depth map).
		let cw = gl.canvas.cw
		let ch = gl.canvas.ch
		gl.viewport(0, 0, cw, ch)
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

		gl.bindTexture(gl.TEXTURE_2D, depth_map)
		opt.draw_scene()

	}

	return depth_map
}

// dashed line rendering -----------------------------------------------------

gl.module('dashed_line.vs', `

	#include base.vs

	out vec4 frag_p1;
	flat out vec4 frag_p2; // because GL_LAST_VERTEX_CONVENTION.

	void dashed_line(final_pos) {
		frag_p1 = final_pos;
		frag_p2 = final_pos;
	}

`)

gl.module('dashed_line.fs', `

	#include base.fs

	uniform vec4 color;
	uniform float dash;
	uniform float gap;

	in vec4 frag_p1;
	flat in vec4 frag_p2; // because GL_LAST_VERTEX_CONVENTION.

	void dashed_line() {
		vec2 p1 = (frag_p1.xyz / frag_p1.w).xy
		vec2 p2 = (frag_p2.xyz / frag_p2.w).xy
		float dist = length((p1 - p2) * screen_size.xy / 2.0);
		if (fract(dist / (dash + gap)) > dash / (dash + gap))
			discard;
		frag_color = color;
	}

`)

// works with gl.LINES drawing mode.
gl.dashed_line_program = function() {
	let vs = `
		#include dashed_line.vs
		void main() { dashed_line() }
	`
	let fs = `
		#include dashed_line.fs
		void main() { dashed_line() }
	`
	let pr = gl.program('dashed_line', vs, fs)
	return pr
}

// fat line rendering --------------------------------------------------------

gl.module('fat_line.vs', `

	#include base.vs

	in vec3 q;
	in float dir;

	void fat_line() {

		// line points in NDC.
		vec4 dp = view_proj * vec4(pos, 1.0);
		vec4 dq = view_proj * vec4(q, 1.0);
		dp /= dp.w;
		dq /= dq.w;

		// line normal in screen space.
		float dx = dq.x - dp.x;
		float dy = dq.y - dp.y;
		vec2 n = normalize(vec2(-dy, dx) * dir) / screen_size * dp.w * 2.0;

		gl_Position = dp + vec4(n, 0.0, 0.0);

	}

`)

gl.module('fat_line.fs', `

	#include base.fs

	uniform vec4 color;

	void fat_line() {
		frag_color = color;
	}

`)

gl.fat_line_program = function() {
	let gl = this
	let vs = `
		#include fat_line.vs
		void main() { fat_line(); }
	`
	let fs = `
		#include fat_line.fs
		void main() { fat_line(); }
	`
	let pr = gl.program('fat_line', vs, fs)

	let pb = gl.dyn_v3_buffer() // 4 points per line.
	let qb = gl.dyn_v3_buffer() // 4 "other-line-endpoint" points per line.
	let db = gl.dyn_i8_buffer() // one direction sign per vertex.
	let ib = gl.dyn_index_buffer(null, u8arr) // 1 quad = 2 triangles = 6 points per line.

	pr.set_points = function(lines) {

		let vertex_count = 4 * lines.length
		let index_count  = 6 * lines.length
		pb.grow(vertex_count)
		qb.grow(vertex_count)
		db.grow(vertex_count)
		ib.grow_type(gl.index_array_type(index_count))
		ib.grow(index_count)

		let ps = pb.array
		let qs = qb.array
		let ds = db.array
		let is = ib.array

		let i = 0
		let j = 0
		for (let line of lines) {

			let p1x = line[0].x
			let p1y = line[0].y
			let p1z = line[0].z
			let p2x = line[1].x
			let p2y = line[1].y
			let p2z = line[1].z

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
		}

		pb.invalidate(0, i)
		qb.invalidate(0, i)
		db.invalidate(0, i)
		ib.invalidate(0, j)
	}

	pr.draw = function() {
		this.use()
		this.set_attr('pos', pb.buffer())
		this.set_attr('q'  , qb.buffer())
		this.set_attr('dir', db.buffer())
		this.set_index(ib.buffer())
		this.gl.draw_triangles()
	}

	let free
	pr.free = function() {
		free.call(this)
		pb.free()
		qb.free()
		db.free()
		ib.free()
	}

	return pr
}

// install extensions --------------------------------------------------------

assign(WebGLRenderingContext.prototype, gl)
assign(WebGL2RenderingContext.prototype, gl)
assign(WebGL2RenderingContext, vao)
assign(WebGLProgram.prototype, prog)
assign(WebGLBuffer.prototype, buf)
assign(WebGLFramebuffer.prototype, fbo)

} // module scope.
