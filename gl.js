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

		b.upload(in_arr, [offset=0], [len], [in_offset=0])
		b.download(out_arr, [offset=0], [len], [out_offset=0])
		b.set(in_b, [offset=0], [len], [in_offset=0])
		b.arr_type, b.gl_type, b.n_components, b.instance_divisor, b.normalize
		b.capacity, b.len

		db.buffer
		db.grow(data | capacity)
		db.grow_type(arr_type)
		db.invalidate([offset, len])

	VAOs

		pr.vao() -> vao
		vao.set_attr(name, b)
		vao.set_uni(name, val...)
		vao.set_uni(name, tex, [texture_unit=0])
		gl.set_uni(name, ...)
		vao.set_index(b)
		vao.use()

	Textures

		gl.texture(['cubemap']) -> tex
		tex.set_rgba(w, h, pixels, [side])
		tex.set_depth(w, h, [f32])
		tex.set_image(image, [pixel_scale], [side])
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

*/

{

// clearing ------------------------------------------------------------------

let gl = WebGL2RenderingContext.prototype

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

let prog = WebGLProgram.prototype

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

		if (gl.uniforms) { // ... set global uniforms.
			for (let name in gl.uniforms) {
				let u = gl.uniforms[name]
				this.set_uni(name, ...u.args)
			}
		}
	}
	return this
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


let vao = WebGLVertexArrayObject.prototype

gl.vao = function() {
	let gl = this
	let vao = gl.createVertexArray()
	vao.gl = gl
	return vao
}

prog.vao = function() {
	let gl = this.gl
	let vao = gl.vao()
	vao.program = this
	if (!this.vaos)
		this.vaos = []
	this.vaos.push(vao)
	return vao
}

vao.bind = function() {
	let gl = this.gl
	if (this != gl.active_vao) {
		assert(!gl.active_program || !this.program || gl.active_program == this.program,
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
	let pr
	if (this.program) {
		pr = this.program
		pr.use()
	} else {
		pr = gl.active_program
		assert(pr, 'no active program for shared VAO')
	}
	this.bind()
	if (this.uniforms) { // VAOs can also hold uniforms (act like UBOs).
		for (let name in this.uniforms) {
			let u = this.uniforms[name]
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

vao.set_attr = function(name, b, stride, offset) {
	let gl = this.gl
	let t = attr(this, 'buffers')
	let b0 = t[name]
	if (b0 != b) {
		let loc = isstr(name) ? this.program.attr_location(name) : name
		if (loc == null)
			return this
		let bound = gl.active_vao == this
		assert(bound || !gl.active_vao)
		if (!bound)
			this.bind()
		stride = stride || 0
		offset = offset || 0
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
			if (b.gl_type == gl.INT || b.gl_type == gl.UNSIGNED_INT) {
				assert(!b.normalize)
				gl.vertexAttribIPointer(loc, b.n_components, b.gl_type, stride, offset)
			} else {
				gl.vertexAttribPointer(loc, b.n_components, b.gl_type, b.normalize, stride, offset)
			}
			if (b.instance_divisor != null)
				gl.vertexAttribDivisor(loc, b.instance_divisor)
			gl.enableVertexAttribArray(loc)
		}
		if (!bound)
			this.unbind()
		t[name] = b
	}
	return this
}

property(vao, 'vertex_count', function() {
	let min_len
	if (this.buffers)
		for (let name in this.buffers) {
			let b = this.buffers[name]
			if (b.instance_divisor == null)
				min_len = min(or(min_len, 1/0), b.len)
		}
	return min_len || 0
})

property(vao, 'instance_count', function() {
	let min_len
	if (this.buffers)
		for (let name in this.buffers) {
			let b = this.buffers[name]
			if (b.instance_divisor != null)
				min_len = min(or(min_len, 1/0), b.len)
		}
	return min_len || 0
})

vao.set_index = function(b) {
	let gl = this.gl
	let bound = gl.active_vao == this
	assert(bound || !gl.active_vao)
	if (!bound)
		this.bind()
	if (this.index_buffer != b) {
		this.index_buffer = b
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b)
	}
	if (!bound)
		this.unbind()
	return this
}

vao.free = function() {
	this.gl.deleteVertexArray(this)
	this.program.vaos.remove_value(this)
	this.free = noop
}

// VBOs ----------------------------------------------------------------------

gl.buffer = function(data_or_cap, arr_type, n_components, instance_divisor, normalize, for_index) {
	assert(instance_divisor == null || instance_divisor == 1, 'NYI')
	let gl = this
	let b = gl.createBuffer()
	let cap, len, arg
	if (isnum(data_or_cap)) {
		cap = data_or_cap
		len = 0
		assert(arr_type, 'array type required')
		assert(n_components != null)
		arg = cap * n_components * arr_type.BYTES_PER_ELEMENT
	} else {
		arg = data_or_cap
		if (isarray(arg)) {
			assert(arr_type, 'array type required')
			arg = new arr_type(arg)
		} else {
			arr_type = arr_type || arg.constructor
			assert(arg instanceof arr_type)
		}
		if (n_components     == null) n_components     = assert(arg.n_components)
		if (for_index        == null) for_index        = arg.for_index
		if (instance_divisor == null) instance_divisor = arg.instance_divisor
		cap = arg.length / n_components
		len = cap
		assert(cap == floor(cap), 'source array length not multiple of {0}', n_components)
	}
	b.gl_target = for_index && gl.ELEMENT_ARRAY_BUFFER || gl.ARRAY_BUFFER
	gl.bindBuffer(b.gl_target, b)
	gl.bufferData(b.gl_target, arg, gl.STATIC_DRAW)
	b.capacity = cap
	b._len = len
	b.gl_type =
		   arr_type ==  f32arr && gl.FLOAT
		|| arr_type ==   u8arr && gl.UNSIGNED_BYTE
		|| arr_type ==  u16arr && gl.UNSIGNED_SHORT
		|| arr_type ==  u32arr && gl.UNSIGNED_INT
		|| arr_type ==   i8arr && gl.BYTE
		|| arr_type ==  i16arr && gl.SHORT
		|| arr_type ==  i32arr && gl.INT
		|| assert(false, 'unsupported array type {0}', arr_type.name)
	b.arr_type = arr_type
	b.gl = gl
	b.n_components = n_components || 1
	b.instance_divisor = instance_divisor
	b.normalize = normalize || false
	return b
}

property(WebGLBuffer, 'len',
	function() { return this._len },
	function(len) {
		assert(len <= this.capacity, 'buffer len exceeds capacity')
		this._len = len
	}
)

let buffer_func = function(arr_type, n_components) {
	return function buffer(data_or_cap, instance_divisor, normalize) {
		return this.buffer(data_or_cap, arr_type, n_components, instance_divisor, normalize)
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
gl.mat4_instance_buffer = function(data_or_cap) { return this.mat4_buffer(data_or_cap, 1) }
gl.i32_instance_buffer  = function(data_or_cap) { return this.i32_buffer(data_or_cap, 1) }
gl.u32_instance_buffer  = function(data_or_cap) { return this.u32_buffer(data_or_cap, 1) }
gl.f32_instance_buffer  = function(data_or_cap) { return this.f32_buffer(data_or_cap, 1) }

gl.index_arr_type = function(data_or_max_idx, arr_type) {
	if (arr_type)
		return arr_type
	if (data_or_max_idx.BYTES_PER_ELEMENT) // typed array
		return data_or_max_idx.constructor
	else if (data_or_max_idx.max_index != null) // hint given
		return data_or_max_idx.max_index
	let max_idx
	if (isnum(data_or_max_idx)) {
		max_idx = data_or_max_idx
	} else if (isarray(data_or_max_idx)) {
		max_idx = 0
		for (let idx of data_or_max_idx)
			max_idx = max(max_idx, idx)
	} else
		assert(false)
	return max_idx > 65535 && u32arr || max_idx > 255 && u16arr || u8arr
}

gl.index_buffer = function(data_or_cap, arr_type) {
	arr_type = gl.index_arr_type(data_or_cap, arr_type)
	return this.buffer(data_or_cap, arr_type, 1, null, false, true)
}

let buf = WebGLBuffer.prototype

buf.arr = function(data_or_len) {
	if (data_or_len == null)
		data_or_len = this.len
	if (isnum(data_or_len))
		data_or_len = data_or_len * this.n_components
	return new this.arr_type(data_or_len)
}

buf.upload = function(in_arr, offset, len, in_offset) {
	let gl = this.gl
	let nc = this.n_components
	if (isarray(in_arr))
		in_arr = new this.arr_type(in_arr)
	else
		assert(in_arr instanceof this.arr_type)
	offset = offset || 0
	in_offset = in_offset || 0
	if (len == null)
		len = in_arr.length / nc - in_offset

	let bpe = in_arr.BYTES_PER_ELEMENT
	gl.bindBuffer(gl.COPY_READ_BUFFER, this)
	gl.bufferSubData(gl.COPY_READ_BUFFER, offset * nc * bpe, in_arr, in_offset * nc, len * nc)

	this._len = max(this._len, offset + len)

	return this
}

buf.download = function(out_arr, offset, len, out_offset) {
	let gl = this
	let nc = this.n_components
	assert(out_arr instanceof this.arr_type)
	offset = offset || 0
	out_offset = out_offset || 0
	if (len == null)
		len = out_arr.length / nc - out_offset

	let bpe = out_arr.BYTES_PER_ELEMENT
	gl.bindBuffer(gl.COPY_READ_BUFFER, this)
	gl.getBufferSubData(gl.COPY_READ_BUFFER, offset * nc * bpe, out_arr, out_offset * nc, len * nc)

	return out_arr
}

buf.set = function(in_buf, offset, len, in_offset) {
	let gl = this.gl
	let nc = this.n_components
	assert(in_buf.gl_type == this.gl_type)
	assert(in_buf.n_components == nc)
	offset = offset || 0
	in_offset = in_offset || 0
	if (len == null)
		len = in_buf.len

	gl.bindBuffer(gl.COPY_READ_BUFFER, in_buf)
	gl.bindBuffer(gl.COPY_WRITE_BUFFER, this)
	let bpe = this.BYTES_PER_ELEMENT
	gl.copyBufferSubData(gl.COPY_READ_BUFFER, gl.COPY_WRITE_BUFFER,
		in_offset * nc * bpe,
		offset * nc * bpe,
		len * nc * bpe)

	this._len = max(this._len, offset + len)

	return this
}

buf.free = function() {
	this.gl.deleteBuffer(this)
}

gl.dyn_buffer = function(arr_type, data_or_cap, n_components, instance_divisor, normalize, for_index) {

	n_components = n_components || 1

	let gl = this
	let db = {
		gl: gl,
		arr_type: arr_type,
		n_components: n_components,
		instance_divisor: instance_divisor,
		normalize: normalize,
		buffer: null,
	}

	db.grow_type = function(arr_type1) {
		if (arr_type1.BYTES_PER_ELEMENT <= arr_type.BYTES_PER_ELEMENT)
			return
		if (this.buffer) {
			let a0 = this.buffer.download(this.buffer.arr())
			this.buffer.free()
			let a1 = new arr_type1(this.len)
			for (let i = 0, n = a0.length * n_components; i < n; i++)
				a1[i] = a0[i]
			this.buffer = gl.buffer(a0, arr_type1, n_components, instance_divisor, normalize, for_index)
		}
		arr_type = arr_type1
		this.arr_type = arr_type1
	}

	db.grow = function(cap, pow2) {
		if (!this.buffer || this.buffer.capacity < cap) {
			if (pow2 !== false)
				cap = nextpow2(cap)
			let b0 = this.buffer
			let b1 = gl.buffer(cap, arr_type, n_components, instance_divisor, normalize, for_index)
			if (b0) {
				b1.set(b0)
				b0.free()
			}
			this.buffer = b1
		}
		return this
	}

	db.free = function() {
		this.buffer.free()
		this.buffer = null
	}

	if (data_or_cap != null)
		if (isnum(data_or_cap)) {
			let cap = data_or_cap
			db.grow(cap)
		} else {
			let data = data_or_cap
			let len = data.length / n_components
			assert(len == floor(len), 'source array length not multiple of {0}', n_components)
			db.buffer = gl.buffer(data, arr_type, n_components, instance_divisor, normalize, for_index)
		}

	property(db, 'capacity', () => db.buffer && db.buffer.capacity || 0)
	property(db, 'len', () => db.buffer && db.buffer.len || 0)

	return db
}

let dyn_buffer_func = function(arr_type, n_components) {
	return function dyn_buffer(data_or_cap, instance_divisor, normalize) {
		return this.dyn_buffer(arr_type, data_or_cap, n_components, instance_divisor, normalize)
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
gl.dyn_mat4_instance_buffer = function(data_or_cap) { return this.dyn_mat4_buffer(data_or_cap, 1) }
gl.dyn_i32_instance_buffer  = function(data_or_cap) { return this.dyn_i32_buffer(data_or_cap, 1) }
gl.dyn_u32_instance_buffer  = function(data_or_cap) { return this.dyn_u32_buffer(data_or_cap, 1) }
gl.dyn_f32_instance_buffer  = function(data_or_cap) { return this.dyn_f32_buffer(data_or_cap, 1) }

gl.dyn_index_buffer = function(data_or_cap, arr_type) {
	let gl = this
	arr_type = gl.index_arr_type(data_or_cap, arr_type)
	return this.dyn_buffer(arr_type, data_or_cap, 1, null, false, true)
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

let set_uni_texture_func = function(gl_target) {
	return function(name, tex, unit) {
		let loc = this.uniform_location(name)
		if (loc) {
			unit = unit || 0
			let gl = this.gl
			if (tex) {
				assert(tex.gl_target == gl_target)
				tex.bind(unit)
			} else
				gl.bindTexture(gl_target, null)
			gl.uniform1i(loc, unit)
		}
		return this
	}
}

prog.set_uni_texture      = set_uni_texture_func(gl.TEXTURE_2D)
prog.set_uni_texture_cube = set_uni_texture_func(gl.TEXTURE_CUBE_MAP)

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
	else if (info.type == gl.SAMPLER_CUBE)
		return this.set_uni_texture_cube(name, a, b)
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
			gl.drawElementsInstanced(gl_mode, b.len, b.gl_type, 0, inst_n)
		} else {
			gl.drawElements(gl_mode, b.len, b.gl_type, 0)
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

let tex = WebGLTexture.prototype

gl.texture = function(target) {
	let gl = this
	let tex = gl.createTexture()
	tex.gl = gl
	tex.gl_target = target == 'cubemap' && gl.TEXTURE_CUBE_MAP || gl.TEXTURE_2D
	return tex
}

tex.bind = function(unit) {
	let gl = this.gl
	gl.activeTexture(gl.TEXTURE0 + (unit || 0))
	gl.bindTexture(this.gl_target, this)
	return this
}

tex.unbind = function() {
	let gl = this.gl
	gl.bindTexture(this.gl_target, null)
	return this
}

tex.free = function() {
	let gl = this.gl
	this.gl.deleteTexture(this)
}

tex.set_depth = function(w, h, f32) {
	let gl = this.gl
	assert(this.gl_target == gl.TEXTURE_2D)
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

let gl_cube_sides = {
	right  : gl.TEXTURE_CUBE_MAP_POSITIVE_X,
	left   : gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
	top    : gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
	bottom : gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
	front  : gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
	back   : gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,

	posx: gl.TEXTURE_CUBE_MAP_POSITIVE_X,
	negx: gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
	posy: gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
	negy: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
	posz: gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
	negz: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
}

let tex_side_target = function(tex, side) {
	if (tex.gl_target == gl.TEXTURE_CUBE_MAP)
		return assert(gl_cube_sides[side], 'invalid cube map texture side {0}', side)
	else {
		assert(!side)
		return tex.gl_target
	}
}

tex.set_rgba = function(w, h, pixels, side) {
	let gl = this.gl
	this.bind()
	gl.texImage2D(tex_side_target(this, side), 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
	this.w = w
	this.h = h
	this.attach = 'color'
	return this
}

let is_pow2 = function(value) {
	return (value & (value - 1)) == 0
}

tex.set_image = function(image, pixel_scale, side) {
	let gl = this.gl
	this.bind()
	let gl_target = tex_side_target(this, side)
	gl.texImage2D(gl_target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
	if (gl_target == gl.TEXTURE_2D)
		gl.generateMipmap(gl_target)
	this.unbind()
	let w = image.width
	let h = image.height
	if (!side) {
		pixel_scale = or(pixel_scale, 1)
		this.uv = v2(
			1 / (w * pixel_scale),
			1 / (h * pixel_scale)
		)
		this.image = image
	} else {
		attr(this, 'images')[side] = image
	}
	this.w = w
	this.h = h
	this.attach = 'color'
	return this
}

let missing_pixel_rgba_1x1 = new u8arr([0, 0, 255, 255])

tex.load = function(url, pixel_scale, on_load, side) {
	let tex = this
	let gl = this.gl
	tex.set_rgba(1, 1, missing_pixel_rgba_1x1, side)
	let image = new Image()
	image.crossOrigin = ''
	image.onload = function() {
		tex.set_image(image, pixel_scale, side)
		tex.loading.remove_value(image)
		if (on_load)
			on_load(tex, image, side)
	}
	image.src = url
	attr(tex, 'loading', Array).push(image)
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
	wrap_t = or(wrap_t, wrap_s)
	this.bind()
	gl.texParameteri(this.gl_target, gl.TEXTURE_WRAP_S, parse_wrap(wrap_s))
	gl.texParameteri(this.gl_target, gl.TEXTURE_WRAP_T, parse_wrap(wrap_t))
	return this
}

let parse_filter = function(s) {
	if (s == 'nearest') return gl.NEAREST
	if (s == 'linear' ) return gl.LINEAR
	if (s == 'nearest_mipmap_nearest') return gl.NEAREST_MIPMAP_NEAREST
	if (s == 'linear_mipmap_nearest' ) return gl.LINEAR_MIPMAP_NEAREST
	if (s == 'nearest_mipmap_linear' ) return gl.NEAREST_MIPMAP_LINEAR // default
	if (s == 'linear_mipmap_linear'  ) return gl.LINEAR_MIPMAP_LINEAR
	assert(false, 'invalid filter value {0}', s)
}

tex.set_filter = function(min_filter, mag_filter) {
	let gl = this.gl
	this.bind()
	gl.texParameteri(this.gl_target, gl.TEXTURE_MIN_FILTER, parse_filter(min_filter))
	gl.texParameteri(this.gl_target, gl.TEXTURE_MAG_FILTER, parse_filter(mag_filter))
	return this
}

// RBOs ----------------------------------------------------------------------

let rbo = WebGLRenderbuffer.prototype

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

let fbo = WebGLFramebuffer.prototype

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

} // module scope.
