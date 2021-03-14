/*

	WebGL 2 wrapper.
	Written by Cosmin Apreutesei.

Programs

	gl.module(name, code)
	gl.program(name, vs_code, fs_code) -> pr

VBOs

	gl.[dyn_]<type>_buffer(data|capacity, [instance_divisor], [normalize]) -> [d]b
		type: f32|u8|u16|u32|i8|i16|i32|v2|v3|v4|mat3|mat4
	gl.[dyn_]mat4_instance_buffer(data|capacity) -> [d]b
	gl.[dyn_]index_buffer(data|capacity, [u8arr|u16arr|u32arr]) -> [d]b

	b.update(data, offset, len)

	db.grow(data | capacity[, clear])
	db.grow_type(array_type)
	db.invalidate([offset, len])
	db.buffer() -> b

VAOs

	pr.vao() -> vao
	vao.set_attr(name, b)
	vao.set_uni(name, val...)
	vao.set_uni(name, tex, [texture_unit=0])
	gl.set_uni(name, ...)
	vao.set_index(b)
	vao.use()

Textures

	gl.texture() -> tex
	tex.set_rgba(w, h, pixels)
	tex.set_depth(w, h, [f32])
	tex.set_image(image, [pixel_scale])
	tex.load(url, [pixel_scale], [on_load])

RBOs

	gl.rbo() -> rbo
	rbo.set_rgba(w, h, [n_samples|multisampling])
	rbo.set_depth(w, h, [f32], [n_samples|multisampling])

FBOs

	gl.fbo() -> fbo
	fbo.bind('read', 'none|back|color', [color_unit=0])
	fbo.bind(['draw'], [ 'none'|'back'|'color'|['none'|'back'|'color',...] ])
	fbo.attach(tex|rbo, 'color|depth|depth_stencil', [color_unit])
	fbo.clear_color(color_unit, r, g, b, [a=1])
	fbo.clear_depth_stencil([depth=1], [stencil=0])
	gl.read_pixels(attachment, color_unit, [buf], [x, y, w, h])
	gl.blit(
		[src_fbo], 'back|color', [color_unit],
		[dst_fbo], [ 'none'|'back'|'color'|['none'|'back'|'color',...] ],
		['color depth stencil'], ['nearest|linear'],
		[sx0], [sy0], [sx1], [sy1],
		[dx0], [dy0], [dx1], [dy1])

Clearing & freeing

	gl.clear_all(r, g, b, [a=1], [depth=1])
	pr|db|b|vao|fbo.free()

Space conversions

	gl.world_to_screen(p, inv_view, proj, [out_v2+]) -> out_v2+
	gl.screen_to_clip(x, y, z, [out_v4]) -> out_v4
	gl.screen_to_view(x, y, z, inv_proj, [out_v4]) -> out_v4
	gl.screen_to_world(mx, my, inv_proj, inv_view, [out_v4]) -> out_v4

*/

{

// gl context and extensions -------------------------------------------------

let gl = {DEBUG: true}

gl.clear_all = function(r, g, b, a, depth) {
	let gl = this
	if (gl.draw_fbo) {
		// NOTE: not using gl.clear(gl.COLOR_BUFFER_BIT) on a FBO because that
		// clears _all_ color buffers, which we don't want (we do clear the
		// secondary color buffers separately with a different value).
		gl.draw_fbo.clear_color(0, r, g, b, a)
		gl.draw_fbo.clear_depth_stencil(depth)
	} else {
		gl.clearColor(r, g, b, or(a, 1))
		gl.clearDepth(or(depth, 1))
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
	}
	gl.enable(gl.DEPTH_TEST)
	gl.depthFunc(gl.LEQUAL)
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

let linenumbers = function(s, errors) {
	let t = map()
	for (let match of errors.matchAll(/ERROR\: 0\:(\d+)\: ([^\n]+)/g))
		t.set(num(match[1]), match[2])
	let i = 0
	s = ('\n' + s).replaceAll(/\n/g, function() {
		i++
		return '\n' + (t.has(i) ? t.get(i) + '\n' + '!' : ' ') + (i+'').padStart(4, ' ') + '  '

	}).slice(1)
	return s
}

gl.shader = function(type, name, gl_type, code) {
	let gl = this

	let shader = gl.createShader(gl_type)
	shader.code = code
	shader.raw_code = preprocess(gl, code, {})
	gl.shaderSource(shader, shader.raw_code)
	gl.compileShader(shader)

	if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		print('ERROR: '+type+' shader "'+name+'" compilation failed')
		let errors = gl.getShaderInfoLog(shader)
		print(errors)
		print(linenumbers(shader.raw_code, errors))
		gl.deleteShader(shader)
		assert(false)
	}

	return shader
}

let prog = {}

gl.program = function(name, vs_code, fs_code) {
	let gl = this

	let pr = attr(gl, 'programs')[name]
	if (pr) {
		assert(pr.vs.code == vs_code)
		assert(pr.fs.code == fs_code)
		return pr
	}

	let vs = gl.shader('vertex'  , name, gl.VERTEX_SHADER  , vs_code)
	let fs = gl.shader('fragment', name, gl.FRAGMENT_SHADER, fs_code)
	pr = gl.createProgram()
	gl.attachShader(pr, vs)
	gl.attachShader(pr, fs)
	gl.linkProgram(pr)
	gl.validateProgram(pr)

	if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
		print('ERROR: "'+name+'" program linking failed')
		print(gl.getProgramInfoLog(pr))
		print('VERTEX SHADER')
		print(vs_code)
		print('FRAGMENT SHADER')
		print(fs_code)
		gl.deleteProgram(pr)
		gl.deleteShader(vs)
		gl.deleteShader(fs)
		assert(false)
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
	gl.programs[name] = pr

	return pr
}

prog.use = function() {
	let gl = this.gl
	if (gl.active_program != this) {
		gl.useProgram(this)
		gl.active_program = this
	}
}

prog.unuse = function() {
	let gl = this.gl
	assert(gl.active_program == this, 'program not in use: {0}', this.name)
	gl.useProgram(null)
	gl.active_program = null
}

prog.free = function() {
	let pr = this
	let gl = pr.gl
	if (gl.active_vao && gl.active_vao.program == this)
		gl.active_vao.unbind()
	for (let vao of this.vaos)
		gl.deleteVertexArray(vao)
	if (gl.active_program == this)
		this.unuse()
	delete gl.programs[pr.name]
	gl.deleteProgram(pr)
	gl.deleteShader(pr.vs)
	gl.deleteShader(pr.fs)
	this.free = noop
}


let vao = {}

prog.vao = function() {
	let gl = this.gl
	let vao = gl.createVertexArray()
	vao.program = this
	vao.gl = gl
	if (!this.vaos)
		this.vaos = []
	this.vaos.push(vao)
	return vao
}

vao.bind = function() {
	let gl = this.gl
	if (this != gl.active_vao) {
		assert(!this.active_program || this.active_program == this.program,
			'different active program')
		gl.bindVertexArray(this)
		gl.active_vao = this
	}
}

vao.unbind = function() {
	let gl = this.gl
	assert(gl.active_vao == this, 'vao not bound')
	gl.bindVertexArray(null)
	gl.active_vao = null
}

vao.use = function() {
	let gl = this.gl
	let pr = this.program
	this.bind()
	pr.use()
	if (this.uniforms) { // VAOs can also hold uniforms (act like UBOs).
		for (let name in this.uniforms) {
			let u = this.uniforms[name]
			pr.set_uni(name, ...u.args)
		}
	}
	if (gl.uniforms) { // ... and we can also have global uniforms.
		for (let name in gl.uniforms) {
			let u = gl.uniforms[name]
			pr.set_uni(name, ...u.args)
		}
	}
	return this
}

vao.unuse = function() {
	this.unbind()
	this.program.unuse()
}

vao.set_uni = function(name, ...args) {
	let u = attr(attr(this, 'uniforms'), name)
	u.args = args
	if (this.gl.active_program == this.program) // set_uni() after use()
		this.program.set_uni(name, ...args)
	return this
}

vao.set_attr = function(name, b) {
	let gl = this.gl
	this.bind()
	let t = attr(this, 'buffers')
	let b0 = t[name]
	if (b0 != b) {
		let loc = this.program.attr_location(name)
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
		let n0 = this.instance_count
		let n1 = b.length / b.n_components
		if (n0 == null)
			this.instance_count = n1
		else
			assert(n1 == n0, 'different instance count for {0}: {1}, was {2}', name, n1, n0)
	} else {
		let n0 = this.vertex_count
		let n1 = b.length / b.n_components
		if (n0 == null)
			this.vertex_count = n1
		else
			assert(n1 == n0, 'different vertex count for {0}: {1}, was {2}', name, n1, n0)
	}
	return this
}

vao.set_index = function(b) {
	let gl = this.gl
	this.bind()
	if (this.index_buffer != b) {
		this.index_buffer = b
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b)
	}
	return this
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
	if (isarray(data_or_cap))
		data_or_cap = new array_type(data_or_cap) // allow js arrays too...
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
	b.array_type = array_type
	b.gl = gl
	b.n_components = n_components
	b.instance_divisor = instance_divisor
	b.normalize = normalize || false
	return b
}

let buffer_func = function(array_type, n_components) {
	return function buffer(data_or_cap, instance_divisor, normalize) {
		return this.buffer(data_or_cap, array_type, n_components, instance_divisor, normalize)
	}
}
gl.f32_buffer  = buffer_func(f32arr,  1)
gl.u8_buffer   = buffer_func(u8arr ,  1)
gl.u16_buffer  = buffer_func(u16arr,  1)
gl.u32_buffer  = buffer_func(u32arr,  1)
gl.i8_buffer   = buffer_func(i8arr ,  1)
gl.i16_buffer  = buffer_func(i16arr,  1)
gl.i32_buffer  = buffer_func(i32arr,  1)
gl.v2_buffer   = buffer_func(f32arr,  2)
gl.v3_buffer   = buffer_func(f32arr,  3)
gl.v4_buffer   = buffer_func(f32arr,  4)
gl.mat3_buffer = buffer_func(f32arr,  9)
gl.mat4_buffer = buffer_func(f32arr, 16)
gl.mat4_instance_buffer = function(data_or_cap) {
	return this.mat4_buffer(data_or_cap, 1)
}
gl.f32_instance_buffer = function(data_or_cap) {
	return this.f32_buffer(data_or_cap, 1)
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

gl.index_buffer = function(data_or_cap, array_type) {
	if (!array_type) {
		assert(isarray(data_or_cap), 'array type required')
		array_type = gl.index_array_type(data_or_cap)
	}
	return this.buffer(data_or_cap, array_type, 1, null, false, true)
}

let buf = {}

buf.update = function(data, offset, len) {
	let b = this
	let gl = this.gl
	offset = offset || 0
	len = len != null ? len : data.length
	gl.bindBuffer(b.gl_target, b)
	let bpe = data.BYTES_PER_ELEMENT
	gl.bufferSubData(b.gl_target, offset * bpe, data, offset, len)
	b.length = max(b.length, offset + len)
	return this
}

buf.free = function() {
	this.gl.deleteBuffer(this)
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

let dyn_buffer_func = function(array_type, n_components) {
	return function dyn_buffer(data_or_cap, instance_divisor, normalize) {
		return this.dyn_buffer(array_type, data_or_cap, n_components, instance_divisor, normalize)
	}
}
gl.dyn_f32_buffer  = dyn_buffer_func(f32arr,  1)
gl.dyn_u8_buffer   = dyn_buffer_func(u8arr ,  1)
gl.dyn_u16_buffer  = dyn_buffer_func(u16arr,  1)
gl.dyn_u32_buffer  = dyn_buffer_func(u32arr,  1)
gl.dyn_i8_buffer   = dyn_buffer_func(i8arr ,  1)
gl.dyn_i16_buffer  = dyn_buffer_func(i16arr,  1)
gl.dyn_i32_buffer  = dyn_buffer_func(i32arr,  1)
gl.dyn_v2_buffer   = dyn_buffer_func(f32arr,  2)
gl.dyn_v3_buffer   = dyn_buffer_func(f32arr,  3)
gl.dyn_v4_buffer   = dyn_buffer_func(f32arr,  4)
gl.dyn_mat3_buffer = dyn_buffer_func(f32arr,  9)
gl.dyn_mat4_buffer = dyn_buffer_func(f32arr, 16)
gl.dyn_mat4_instance_buffer = function(data_or_cap) {
	return this.dyn_mat4_buffer(data_or_cap, 1)
}
gl.dyn_f32_instance_buffer = function(data_or_cap) {
	return this.dyn_f32_buffer(data_or_cap, 1)
}

gl.dyn_index_buffer = function(data_or_cap, array_type) {
	let gl = this
	if (!array_type) {
		assert(isarray(data_or_cap), 'array type required')
		array_type = gl.index_array_type(data_or_cap)
	}
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
			x = (c >> 24       ) / 255
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
		unit = unit || 0
		let gl = this.gl
		if (tex)
			tex.bind(unit)
		else
			gl.bindTexture(gl.TEXTURE_2D, null)
		gl.uniform1i(loc, unit)
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
		return this.set_uni_texture(name, a, b)
	else
		assert(false, 'unknown uniform type for {0}', name)
}

gl.set_uni = function(name, ...args) {
	let u = attr(attr(this, 'uniforms'), name)
	u.args = args
	return this
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

let tex = {}

gl.texture = function(opt) {
	let gl = this
	let tex = gl.createTexture()
	tex.gl = gl
	return tex
}

tex.bind = function(unit) {
	let gl = this.gl
	gl.activeTexture(gl.TEXTURE0 + (unit || 0))
	gl.bindTexture(gl.TEXTURE_2D, this)
	return this
}

tex.unbind = function() {
	let gl = this.gl
	gl.bindTexture(gl.TEXTURE_2D, null)
	return this
}

tex.free = function() {
	let gl = this.gl
	this.gl.deleteTexture(this)
}

tex.set_depth = function(w, h, f32) {
	let gl = this.gl
	this.bind()
	gl.texImage2D(gl.TEXTURE_2D, 0,
		f32 ? gl.DEPTH_COMPONENT32F : gl.DEPTH_COMPONENT24,
		w, h, 0, gl.DEPTH_COMPONENT, f32 ? gl.FLOAT : gl.UNSIGNED_INT, null)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
	this.w = w
	this.h = h
	this.attach = 'depth'
	return this
}

tex.set_rgba = function(w, h, pixels) {
	let gl = this.gl
	this.bind()
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
	this.w = w
	this.h = h
	this.attach = 'color'
	return this
}

let is_pow2 = function(value) {
	return (value & (value - 1)) == 0
}

tex.set_image = function(image, pixel_scale) {
	let gl = this.gl
	this.bind()
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
	gl.generateMipmap(gl.TEXTURE_2D)
	this.unbind()
	pixel_scale = or(pixel_scale, 1)
	this.w = image.width
	this.h = image.height
	this.uv = v2(
		1 / (this.w * pixel_scale),
		1 / (this.h * pixel_scale)
	)
	this.image = image
	this.attach = 'color'
	return this
}

let missing_pixel_rgba_1x1 = new u8arr([0, 0, 255, 255])

tex.load = function(url, pixel_scale, on_load) {
	let tex = this
	let gl = this.gl
	tex.set_rgba(1, 1, missing_pixel_rgba_1x1)
	let image = new Image()
	image.crossOrigin = ''
	image.onload = function() {
		tex.set_image(image, pixel_scale)
		tex.loaded = true
		if (on_load)
			on_load(tex)
	}
	image.src = url
	tex.image = image
	return tex
}

let parse_wrap = function(s) {
	if (s == 'repeat') return gl.REPEAT
	if (s == 'clamp') return gl.CLAMP_TO_EDGE
	if (s == 'mirror') return gl.MIRRORED_REPEAT
	assert(false, 'invalid wrap value {0}', s)
}

tex.set_wrap = function(wrap_s, wrap_t) {
	let gl = this.gl
	this.bind()
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, parse_wrap(wrap_s))
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, parse_wrap(wrap_t))
}

// RBOs ----------------------------------------------------------------------

let rbo = {}

gl.rbo = function() {
	let rbo = this.createRenderbuffer()
	rbo.gl = this
	return rbo
}

rbo.bind = function() {
	let gl = this.gl
	gl.bindRenderbuffer(gl.RENDERBUFFER, this)
	return this
}

rbo.unbind = function() {
	let gl = this.gl
	gl.bindRenderbuffer(gl.RENDERBUFFER, null)
}

rbo.free = function() {
	this.gl.deleteRenderBuffer(this)
}

// NOTE: `n_samples` must be the same on _all_ RBOs attached to the same FBO.
// NOTE: can't blit a MSAA FBO onto a MSAA canvas (disable MSAA on the canvas!).
let rbo_set = function(rbo, gl, attach, gl_format, w, h, n_samples) {
	rbo.bind()
	if (n_samples != null) {
		n_samples = min(repl(n_samples, true, 4), gl.getParameter(gl.MAX_SAMPLES))
		gl.renderbufferStorageMultisample(gl.RENDERBUFFER, rbo.n_samples, gl_format, w, h)
	} else {
		gl.renderbufferStorage(gl.RENDERBUFFER, gl_format, w, h)
	}
	rbo.w = w
	rbo.h = h
	rbo.n_samples = n_samples
	rbo.attach = attach
	return rbo
}

rbo.set_rgba = function(w, h, n_samples) {
	return rbo_set(this, this.gl, 'color', this.gl.RGBA8, w, h, n_samples)
}

rbo.set_depth = function(w, h, f32, n_samples) {
	let gl = this.gl
	let gl_format = f32 ? gl.DEPTH_COMPONENT32F : gl.DEPTH_COMPONENT24
	return rbo_set(this, gl, 'depth', gl_format, w, h, n_samples)
}

// FBOs ----------------------------------------------------------------------

let fbo = {}

gl.fbo = function() {
	let fbo = this.createFramebuffer()
	fbo.gl = this
	return fbo
}

let parse_attachment = function(gl, s, i) {
	if (s == 'color') return gl.COLOR_ATTACHMENT0 + i
	if (s == 'back') return gl.BACK
	if (s == 'none') return gl.NONE
	return assert(s, 'invalid attachment {0}', s)
}

gl.set_read_buffer = function(attachment, color_unit) {
	this.readBuffer(parse_attachment(this, attachment, color_unit))
}

gl.set_draw_buffers = function(attachments) {
	if (!isarray(attachments))
		attachments = [attachments || 'color']
	this.drawBuffers(attachments.map((s, i) => parse_attachment(this, s, i)))
}

fbo.bind = function(mode, attachments, color_unit) {
	let gl = this.gl
	assert(!gl.active_vao)
	assert(!gl.active_program)
	let gl_target
	if (mode == 'read') {
		if (this != gl.read_fbo) {
			gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this)
			gl.read_fbo = this
		}
		let att = parse_attachment(gl, attachments || 'color', color_unit || 0)
		if (this.read_attachment != att) {
			gl.readBuffer(att)
			this.read_attachment = att
		}
	} else if (!mode || mode == 'draw') {
		if (this != gl.draw_fbo) {
			gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this)
			gl.draw_fbo = this
		}
		gl.set_draw_buffers(attachments)
	} else
		assert(false)
	return this
}

gl.blit = function(
	src_fbo, read_attachment, color_unit,
	dst_fbo, draw_attachments,
	mask, filter,
	src_x0, src_y0, src_x1, src_y1,
	dst_x0, dst_y0, dst_x1, dst_y1
) {
	let gl = this

	assert(!gl.read_fbo)
	assert(!gl.draw_fbo)

	if (src_fbo) {
		src_fbo.bind('read', read_attachment, color_unit)
	} else {
		gl.set_read_buffer(read_attachment, color_unit)
	}

	if (dst_fbo) {
		dst_fbo.bind('draw', draw_attachments)
	} else {
		gl.set_draw_buffers(draw_attachments)
	}

	if (src_x0 == null) {
		src_x0 = 0
		src_y0 = 0
		src_x1 = src_fbo.w
		src_y1 = src_fbo.h
	} else {
		assert(src_x0 != null)
		assert(src_y0 != null)
		assert(src_x1 != null)
		assert(src_y1 != null)
	}

	if (dst_x0 == null) {
		dst_x0 = 0
		dst_y0 = 0
		dst_x1 = dst_fbo.w
		dst_y1 = dst_fbo.h
	} else {
		assert(dst_x0 != null)
		assert(dst_y0 != null)
		assert(dst_x1 != null)
		assert(dst_y1 != null)
	}

	mask = mask && (
			(mask.includes('color') && gl.COLOR_BUFFER_BIT || 0) ||
			(mask.includes('depth') && gl.DEPTH_BUFFER_BIT || 0) ||
			(mask.includes('stencil') && gl.STENCIL_BUFFER_BIT || 0)
		) || gl.COLOR_BUFFER_BIT

	filter = filter && (
			(filter.includes('nearest') && gl.NEAREST || 0) ||
			(filter.includes('linear') && gl.LINEAR || 0)
		) || gl.NEAREST

	gl.blitFramebuffer(
		src_x0, src_y0, src_x1, src_y1,
		dst_x0, dst_y0, dst_x1, dst_y1,
		mask, filter
	)

	if (src_fbo) src_fbo.unbind()
	if (dst_fbo) dst_fbo.unbind()
}

fbo.read_pixels = function(attachment, color_unit, buf, x, y, w, h) {
	let gl = this.gl
	let fbo = this
	assert(!gl.read_fbo)
	fbo.bind('read', attachment, color_unit)
	if (x == null) {
		x = 0
		y = 0
		w = fbo.w
		h = fbo.h
	} else {
		assert(x != null)
		assert(y != null)
		assert(w != null)
		assert(h != null)
	}
	if (!buf)
		buf = new u8arr(w * h * 4)
	gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)
	fbo.unbind()
	return buf
}

fbo.gl_target = function() {
	let gl = this.gl
	if (gl.read_fbo == this) return gl.READ_FRAMEBUFFER
	if (gl.draw_fbo == this) return gl.DRAW_FRAMEBUFFER
	assert(false, 'fbo not bound')
}

fbo.unbind = function() {
	let gl = this.gl
	assert(!gl.active_vao)
	assert(!gl.active_program)
	if (this == gl.read_fbo) {
		gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
		gl.read_fbo = null
	} else if (this == gl.draw_fbo) {
		gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
		gl.draw_fbo = null
	} else
		assert(false, 'not the bound fbo')
	return this
}

fbo.free = function() {
	this.gl.deleteFramebuffer(this)
}

fbo.attach = function(tex_or_rbo, target, color_unit) {
	let gl = this.gl
	let fbo_att = {
		color: gl.COLOR_ATTACHMENT0,
		depth: gl.DEPTH_ATTACHMENT,
		depth_stencil: gl.DEPTH_STENCIL_ATTACHMENT,
	}
	target = target || tex_or_rbo.attach
	color_unit = color_unit || 0
	let gl_attach = assert(fbo_att[target]) + color_unit
	if (tex_or_rbo instanceof WebGLRenderbuffer) {
		let rbo = tex_or_rbo
		rbo.bind()
		gl.framebufferRenderbuffer(this.gl_target(), gl_attach, gl.RENDERBUFFER, rbo)
		assert(this.n_samples == null || rbo.n_samples == null || this.n_samples == rbo.n_samples,
			'different n_samples {0}, was {1}', rbo.n_samples, this.n_samples)
		this.n_samples = or(rbo.n_samples, this.n_samples)
	} else if (tex_or_rbo instanceof WebGLTexture) {
		let tex = tex_or_rbo
		gl.framebufferTexture2D(this.gl_target(), gl_attach, gl.TEXTURE_2D, tex, 0)
	} else
		assert(false, 'Renderbuffer or Texture expected')

	assert(this.w == null || tex_or_rbo.w == null || this.w == tex_or_rbo.w,
		'different width {0}, was ', tex_or_rbo.w, this.w)
	assert(this.h == null || tex_or_rbo.h == null || this.h == tex_or_rbo.h,
		'different height {0}, was ', tex_or_rbo.h, this.h)
	this.w = or(tex_or_rbo.w, this.w)
	this.h = or(tex_or_rbo.h, this.h)

	attr(this, 'attachments')[target + color_unit] = tex_or_rbo

	return this
}

let _c = new f32arr([0, 0, 0, 0])
fbo.clear_color = function(color_unit, r, g, b, a) {
	let gl = this.gl
	assert(gl.draw_fbo == this, 'not the draw fbo')
	_c[0] = r
	_c[1] = g
	_c[2] = b
	_c[3] = or(a, 1)
	gl.clearBufferfv(gl.COLOR, color_unit, _c)
}

fbo.clear_depth_stencil = function(depth, stencil) {
	let gl = this.gl
	assert(gl.draw_fbo == this, 'not the draw fbo')
	gl.clearBufferfi(gl.DEPTH_STENCIL, 0, or(depth, 1), or(stencil, 0))
}

// space conversions ---------------------------------------------------------

// https://antongerdelan.net/opengl/raycasting.html

gl.world_to_screen = function(p, inv_view, proj, out) {
	out = out || v2()
	out.set(p).transform(inv_view).transform(proj)
	out[0] = round(( out[0] + 1) * this.canvas.cw / 2)
	out[1] = round((-out[1] + 1) * this.canvas.ch / 2)
}

gl.screen_to_clip = function(x, y, z, out) {
	out = out || v4()
	let w = this.canvas.cw
	let h = this.canvas.ch
	out[0] = (2 * x) / w - 1
	out[1] = 1 - (2 * y) / h
	out[2] = z
	out[3] = 1
	return out
}

gl.screen_to_view = function(x, y, z, inv_proj, out) {
	let ray = this.screen_to_clip(x, y, z, out)
	ray.transform(inv_proj) // clip space -> view space
	ray.z = z
	return ray
}

gl.screen_to_world = function(mx, my, inv_proj, inv_view, out) {
	let ray = this.screen_to_view(mx, my, -1, inv_proj, out)
	ray.w = 0 // it's a (non-translatable) direction, not a point.
	ray.transform(inv_view) // view space -> world space
	return ray.normalize()
}

// phong renderer with shadow mapping ----------------------------------------

// based on tutorials from learnopengl.com.

gl.module('base.vs', `

	#version 300 es

	uniform mat4 view;
	uniform mat4 proj;
	uniform mat4 view_proj;
	uniform vec2 viewport_size;

	in mat4 model;
	in vec3 pos;
	in vec3 normal;
	in vec2 uv;

	vec4 mvp_pos() {
		return view_proj * model * vec4(pos, 1.0);
	}

`)

gl.module('base.fs', `

	#version 300 es

	precision highp float;
	precision highp int;

	uniform vec3 view_pos;
	uniform vec2 viewport_size;
	uniform vec4 diffuse_color;
	uniform sampler2D diffuse_map;

	layout (location = 0) out vec4 frag_color;

`)

gl.module('phong.vs', `

	#include base.vs

	uniform mat4 sdm_view_proj;

	out vec3 frag_pos;
	out vec3 frag_normal;
	out vec2 frag_uv;
	out vec4 frag_pos_sdm_view_proj;

	void do_phong() {
		frag_pos = vec3(model * vec4(pos, 1.0));
		frag_pos_sdm_view_proj = sdm_view_proj * vec4(frag_pos, 1.0);
		frag_normal = inverse(transpose(mat3(model))) * normal;
		frag_uv = uv;
		gl_Position = view_proj * vec4(frag_pos, 1.0);
	}

`)

gl.module('phong.fs', `

	#include base.fs

	uniform vec3 sunlight_pos;
	uniform vec3 sunlight_color;
	uniform float shininess;
	uniform float ambient_strength;
	uniform float specular_strength;
	uniform bool enable_shadows;
	uniform sampler2D shadow_map;

	in vec3 frag_pos;
	in vec3 frag_normal;
	in vec2 frag_uv;
	in vec4 frag_pos_sdm_view_proj;

	void do_phong() {

		float ambient = ambient_strength;

		vec3 normal = normalize(frag_normal);
		vec3 light_dir = normalize(sunlight_pos - frag_pos);
		float diffuse = max(dot(normal, light_dir), 0.0);

		vec3 view_dir = normalize(view_pos - frag_pos);
		vec3 reflect_dir = reflect(-light_dir, normal);
		float specular = specular_strength * pow(max(dot(view_dir, reflect_dir), 0.0), shininess);

		float shadow = 0.0;
		if (enable_shadows) {

			vec3 p = frag_pos_sdm_view_proj.xyz / frag_pos_sdm_view_proj.w;
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

		frag_color = vec4(light * sunlight_color, 1.0) * diffuse_color * texture(diffuse_map, frag_uv);

	}

`)

gl.renderer = function(r) {

	let gl = this

	r = r || {}

	r.background_color = r.background_color || v4(1, 1, 1, 1)
	r.sunlight_dir = r.sunlight_dir || v3(1, 1, 0)
	r.sunlight_color = r.sunlight_color || v3(1, 1, 1)
	r.diffuse_color = r.diffuse_color || v4(1, 1, 1, 1)
	r.sdm_proj = r.sdm_proj || mat4().ortho(-10, 10, -10, 10, -1e4, 1e4)

	let sunlight_view = mat4()
	let sdm_view_proj = mat4()
	let origin = v3(0, 0, 0)
	let up_dir = v3(0, 1, 0)
	let sunlight_pos = v3()

	let sdm_pr = gl.program('sdm', `
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

	let sdm_vao = sdm_pr.vao()
	let sdm_tex = gl.texture()
	let sdm_fbo = gl.fbo()

	let sdm_res

	r.update = function() {

		sunlight_pos.set(r.sunlight_dir).set_len(1e3)
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
			draw(sdm_vao)
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

// dashed line rendering -----------------------------------------------------

// works with gl.LINES drawing mode.
gl.dashed_line_program = function() {
	return this.program('dashed_line', `

		#include base.vs

		out vec4 frag_p1;
		flat out vec4 frag_p2; // because GL_LAST_VERTEX_CONVENTION.

		void main() {
			vec4 p = mvp_pos();
			frag_p1 = p;
			frag_p2 = p;
			gl_Position = p;
		}

	`, `

		#include base.fs

		uniform vec4 color;
		uniform float dash;
		uniform float gap;

		in vec4 frag_p1;
		flat in vec4 frag_p2; // because GL_LAST_VERTEX_CONVENTION.

		void main() {
			vec2 p1 = (frag_p1.xyz / frag_p1.w).xy;
			vec2 p2 = (frag_p2.xyz / frag_p2.w).xy;
			float dist = length((p1 - p2) * viewport_size.xy / 2.0);
			if (fract(dist / (dash + gap)) > dash / (dash + gap))
				discard;
			frag_color = color;
		}

	`)
}

// fat line rendering --------------------------------------------------------

gl.module('fat_line.vs', `

	#include base.vs

	in vec3 q;
	in float dir;

	void do_fat_line() {

		// line points in NDC.
		vec4 dp = view_proj * vec4(pos, 1.0);
		vec4 dq = view_proj * vec4(q, 1.0);
		dp /= dp.w;
		dq /= dq.w;

		// line normal in screen space.
		float dx = dq.x - dp.x;
		float dy = dq.y - dp.y;
		vec2 n = normalize(vec2(-dy, dx) * dir) / viewport_size * dp.w * 2.0;

		gl_Position = dp + vec4(n, 0.0, 0.0);

	}

`)

gl.module('fat_line.fs', `

	#include base.fs

	uniform vec4 color;

	void do_fat_line() {
		frag_color = color;
	}

`)

gl.fat_line_vao = function() {
	let gl = this
	let pr = gl.program('fat_line', `
		#include fat_line.vs
		void main() {
			do_fat_line();
		}
	`, `
		#include fat_line.fs
		void main() {
			do_fat_line();
		}
	`)
	let vao = pr.vao()
	let pb = gl.dyn_v3_buffer() // 4 points per line.
	let qb = gl.dyn_v3_buffer() // 4 "other-line-endpoint" points per line.
	let db = gl.dyn_i8_buffer() // one direction sign per vertex.
	let ib = gl.dyn_index_buffer(null, u8arr) // 1 quad = 2 triangles = 6 points per line.

	vao.set_points = function(lines) {

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

	vao.draw = function() {
		vao.use()
		vao.set_attr('pos', pb.buffer())
		vao.set_attr('q'  , qb.buffer())
		vao.set_attr('dir', db.buffer())
		vao.set_index(ib.buffer())
		this.gl.draw_triangles()
		vao.unuse()
	}

	let free
	vao.free = function() {
		free.call(this)
		pb.free()
		qb.free()
		db.free()
		ib.free()
	}

	return vao
}

gl.skydome = function(opt) {

	let gl = this

	let pr = gl.program('skydome', `

		#include base.vs

		out vec3 frag_model_pos;

		void main() {
			vec4 model_pos = model * vec4(pos, 1.0);
			frag_model_pos = model_pos.xyz;
			gl_Position = view_proj * model_pos;
		}

	`, `

		#include base.fs

		uniform vec3 sky_color;
		uniform vec3 horizon_color;
		uniform vec3 ground_color;
		uniform float offset;
		uniform float exponent;

		in vec3 frag_model_pos;

		void main() {
			float h = normalize(frag_model_pos).y;
			frag_color = vec4(
				mix(
					mix(horizon_color, sky_color, pow(max(h, 0.0), exponent)),
					ground_color,
					1.0-step(0.0, h)
			), 1.0);
		}

	`)

	let vao = pr.vao()
	vao.set_uni('sky_color', opt.sky_color)
	vao.set_uni('horizon_color', opt.horizon_color)
	vao.set_uni('ground_color', opt.ground_color)

	// TODO...
	let d = 2 * pe.max_distance
	let geo = new THREE.BoxBufferGeometry(d, d, d)
	let mat = new THREE.ShaderMaterial({
		uniforms       : uniforms,
		vertexShader   : vshader,
		fragmentShader : fshader,
		side: THREE.BackSide,
	})

	let e = new THREE.Mesh(geo, mat)
	e.name = 'skydome'

	return pr
}

// render-based hit testing --------------------------------------------------

// NITE: supports up-to 2^16 instances of 2^16 vertices.
gl.face_id_renderer = function(r) {

	let gl = this

	r = r || {}

	let pr = gl.program('face_id', `
		#include base.vs
		in float face_id;
		in float inst_id;
		flat out int frag_face_id;
		flat out int frag_inst_id;
		void main() {
			gl_Position = mvp_pos();
			frag_face_id = int(face_id); // max 2^23 integers.
			frag_inst_id = int(inst_id); // max 2^23 integers.
		}
	`, `
		#include base.fs
		flat in int frag_face_id;
		flat in int frag_inst_id;
		layout (location = 1) out vec4 frag_color1;
		vec4 to_color(int id) {
			return vec4(
				float((id >> 24) & 0xff) / 255.0,
				float((id >> 16) & 0xff) / 255.0,
				float((id >>  8) & 0xff) / 255.0,
				float((id      ) & 0xff) / 255.0
			);
		}
		void main() {
			frag_color  = to_color(frag_face_id);
			frag_color1 = to_color(frag_inst_id);
		}
	`)

	let w, h
	let vao = pr.vao()
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
			face_id_map.set_rgba(w, h)
			face_id_arr = new u8arr(w * h * 4)
			inst_id_map.set_rgba(w, h)
			inst_id_arr = new u8arr(w * h * 4)
			depth_map.set_depth(w, h, true)
		}
		fbo.bind()
		fbo.attach(face_id_map, 'color', 0)
		fbo.attach(inst_id_map, 'color', 1)
		fbo.attach(depth_map)
		gl.clear_all(0, 0, 0, 0)
		draw(vao)
		fbo.unbind()
		fbo.read_pixels('color', 0, face_id_arr)
		fbo.read_pixels('color', 1, inst_id_arr)
		for (let e of inst_id_arr)
			if (e != 0)
				print(e)
	}

	function read(arr, x, y) {
		let r = arr[4 * (y * w + x) + 0]
		let g = arr[4 * (y * w + x) + 1]
		let b = arr[4 * (y * w + x) + 2]
		let a = arr[4 * (y * w + x) + 3]
		return (r << 24) | (g << 16) | (b << 8) | a
	}

	r.hit_test = function(x, y) {
		if (!face_id_arr)
			return
		x = clamp(x, 0, w-1)
		y = clamp(y, 0, h-1)
		y = (h-1) - y // textures are read upside down...
		let face_id = read(face_id_arr, x, y)
		let inst_id = read(inst_id_arr, x, y)
		return [inst_id, face_id]
	}

	return r

}

// debugging props -----------------------------------------------------------

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
		#include base.vs
		out vec2 frag_uv;
		void main() {
			frag_uv = uv;
			gl_Position = mvp_pos();
		}
	`, `
		#include base.fs
		in vec2 frag_uv;
		void main() {
			frag_color = vec4(vec3(texture(diffuse_map, frag_uv).r), 1.0);
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

// install extensions --------------------------------------------------------

assign(WebGL2RenderingContext.prototype, gl)
assign(WebGLVertexArrayObject.prototype, vao)
assign(WebGLProgram.prototype, prog)
assign(WebGLBuffer.prototype, buf)
assign(WebGLTexture.prototype, tex)
assign(WebGLFramebuffer.prototype, fbo)
assign(WebGLRenderbuffer.prototype, rbo)

} // module scope.
