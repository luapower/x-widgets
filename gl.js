/*

	WebGL 2 wrapper.
	Written by Cosmin Apreutesei.

	Programs

		gl.module(name, code)
		gl.program(name, vs_code, fs_code) -> pr

	VBOs

		gl.[dyn_][arr_]<type>_[instance_]buffer(data|capacity, [normalize]) -> [d][a]b
			type: f32|u8|u16|u32|i8|i16|i32|v2|v3|v4|mat3|mat4
		gl.[dyn_][arr_]index_buffer(data|capacity, [type|max_idx]) -> [d][a]b
			type: u8|u16|u32
		gl.dyn_arr_vertex_buffer({name->type}) -> davb

		b.upload(in_arr, [offset=0], [len], [in_offset=0])
		b.download(out_arr, [offset=0], [len], [out_offset=0])
		b.set(in_b, [offset=0], [len], [in_offset=0])
		b.arr([data|len]) -> a
		b.len
		b.arr_type b.gl_type b.n_components b.instance_divisor b.normalize b.for_index

		db.buffer
		db.grow_type(arr|[...]|u8arr|u16arr|u32arr|max_idx)
		db.len
		db.arr_type db.n_components db.instance_divisor db.normalize db.for_index

		dab.buffer
		dab.array
		dab.grow_type
		dab.len
		dab.set
		dab.get
		dab.invalidate
		dab.upload

		davb.len
		davb.<name> -> dab
		davb.to_vao(vao)

	VAOs

		pr.vao() -> vao
		vao.use()
		vao.set_attrs(davb)
		vao.set_attr(name, b)
		vao.set_uni(name, val...)
		vao.set_uni(name, tex, [texture_unit=0])
		gl.set_uni(name, ...)
		vao.set_index(b)
		vao.unuse()
		vao.dab(attr_name, [cap]) -> dab

	Textures

		gl.texture(['cubemap']) -> tex
		tex.set_rgba(w, h, pixels, [side])
		tex.set_u32(w, h, values, [side])
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

(function() {

// clearing ------------------------------------------------------------------

let gl = WebGL2RenderingContext.prototype

gl.clear_all = function(r, g, b, a, depth) {
	let gl = this
	if (gl.draw_fbo) {
		// NOTE: not using gl.clear(gl.COLOR_BUFFER_BIT) on a FBO because that
		// clears _all_ color buffers, which we don't want (we do clear the
		// secondary color buffers separately with a different value).
		if (r != null)
			gl.draw_fbo.clear_color(0, r, g, b, a)
		gl.draw_fbo.clear_depth_stencil(depth)
	} else {
		if (r != null)
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
	let t = attr(this, 'includes')
	assert(t[name] == null, 'module already exists {0}', name)
	t[name] = outdent(s)
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

let attr_buffer_types = {
	[gl.FLOAT          ] : 'f32',
	[gl.UNSIGNED_BYTE  ] : 'u8',
	[gl.UNSIGNED_SHORT ] : 'u16',
	[gl.UNSIGNED_INT   ] : 'u32',
	[gl.BYTE           ] : 'i8',
	[gl.SHORT          ] : 'i16',
	[gl.INT            ] : 'i32',
	[gl.FLOAT_VEC2     ] : 'v2',
	[gl.FLOAT_VEC3     ] : 'v3',
	[gl.FLOAT_VEC4     ] : 'v4',
	[gl.FLOAT_MAT3     ] : 'mat3',
	[gl.FLOAT_MAT4     ] : 'mat4',
}

gl.program = function(name, vs_code, fs_code) {
	let gl = this

	let pr = attr(gl, 'programs')[assert(isstr(name), 'program name required')]
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

	pr.attr_info = {}
	pr.attr_count = gl.getProgramParameter(pr, gl.ACTIVE_ATTRIBUTES)
	for (let i = 0, n = pr.attr_count; i < n; i++) {
		let info = gl.getActiveAttrib(pr, i)
		info.buffer_type = attr_buffer_types[info.type]
		pr.attr_info[info.name] = info
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
				let args = gl.uniforms[name]
				this.set_uni(name, ...args)
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
	let prog
	if (this.program) {
		prog = this.program
		prog.use()
	} else {
		prog = gl.active_program
		assert(prog, 'no active program for shared VAO')
	}
	this.bind()

	// simulate VAO-specific uniforms.
	let unis = prog.vao_uniforms
	if (unis) {
		assert(this.uniforms, 'no uniforms assigned')
		for (let name in unis) {
			let args = assert(this.uniforms[name], 'uniform {0} not assigned', name)
			prog.set_uni(name, ...args)
		}
	}

	return this
}

vao.unuse = function() {
	this.unbind()
	this.program.unuse()
}

vao.set_uni = function(name, ...args) {
	assign(attr(attr(this, 'uniforms'), name, Array), args)
	attr(this.program, 'vao_uniforms')[name] = true
	if (this.gl.active_program == this.program) // set_uni() after use()
		this.program.set_uni(name, ...args)
	return this
}

vao.set_attr = function(name, b, stride, offset) {
	let gl = this.gl
	let t = attr(this, 'buffers')
	let b0 = t[name]
	if (b0 == b)
		return this
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
	return this
}

vao.set_attrs = function(davb) {
	assert(davb.is_dyn_arr_vertex_buffer)
	davb.to_vao(this)
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

gl.vao_set = function() {
	let vaos = {}
	let e = {}
	e.vao = function(prog) {
		let vao = vaos[prog.name]
		if (!vao) {
			vao = prog.vao()
			vaos[prog.name] = vao
		}
		return vao
	}
	e.free = function() {
		for (let prog_name in vaos)
			vaos[prog_name].free()
		vaos = null
	}
	return e
}

// VBOs ----------------------------------------------------------------------

function check_arr_type(arr, arr_type) {
	if (!arr_type)
		return arr.constructor
	assert(arr instanceof arr_type, 'different arr_type {0}, wanted {1}', arr.constructor.name, arr_type.name)
	return arr_type
}

function check_arr_nc(arr, nc) {
	let arr_nc = arr.n_components
	nc = or(nc, arr_nc)
	assert(nc != null, 'n_components required')
	assert(or(arr_nc, nc) == nc, 'different n_components {0}, wanted {1}', arr_nc, nc)
	return nc
}

function check_arr_len(nc, arr, len, arr_offset) {
	if (len == null)
		if (arr.len != null) // dyn_arr
			len = arr.len - arr_offset
	if (len == null) {
		len = arr.length / nc - arr_offset
		assert(len == floor(len), 'array length not multiple of {0}', nc)
	}
	return max(0, len)
}

gl.buffer = function(data_or_cap, arr_type, nc, instance_divisor, normalize, for_index) {
	assert(instance_divisor == null || instance_divisor == 1, 'NYI')
	let gl = this
	let b = gl.createBuffer()
	let cap, len, arg
	if (isnum(data_or_cap)) { // capacity, arr_type, ...
		assert(arr_type, 'arr_type required')
		assert(nc != null, 'n_components required')
		cap = data_or_cap
		len = 0
		arg = cap * nc * arr_type.BYTES_PER_ELEMENT
	} else {
		arg = data_or_cap
		if (isarray(arg)) { // [elements, ...], arr_type, ...
			assert(arr_type, 'arr_type required')
			arg = new arr_type(arg)
		} else { // arr, [arr_type], ...
			arr_type = check_arr_type(arg, arr_type)
		}
		nc = check_arr_nc(arg, nc)
		cap = check_arr_len(nc, arg, null, 0)
		len = cap
	}
	b.for_index = for_index
	b.gl_target = for_index ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER
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
		|| assert(false, 'unsupported arr_type {0}', arr_type.name)
	b.arr_type = arr_type
	b.gl = gl
	b.n_components = nc
	b.instance_divisor = instance_divisor
	b.normalize = normalize || false

	gl.bindBuffer(b.gl_target, b)
	gl.bufferData(b.gl_target, arg, gl.STATIC_DRAW)

	return b
}

property(WebGLBuffer, 'len',
	function() { return this._len },
	function(len) {
		assert(len <= this.capacity, 'len exceeds capacity')
		this._len = len
	}
)

function index_arr_type(data_or_cap, arr_type_or_max_idx) {
	return dyn_arr.index_arr_type(or(arr_type_or_max_idx, or(data_or_cap, 0)))
}

gl.index_buffer = function(data_or_cap, arr_type_or_max_idx) {
	let arr_type = index_arr_type(data_or_cap, arr_type_or_max_idx)
	return this.buffer(data_or_cap, arr_type, 1, null, false, true)
}

let buf = WebGLBuffer.prototype

buf.arr = function(data_or_len) {
	if (data_or_len == null)
		data_or_len = this.len
	let nc = this.n_components
	if (isnum(data_or_len))
		data_or_len = data_or_len * nc
	else
		check_arr_nc(data_or_len, nc)
	let arr = new this.arr_type(data_or_len)
	arr.n_components = this.n_components
	return arr
}

buf.upload = function(in_arr, offset, len, in_offset) {
	let gl = this.gl
	let nc = this.n_components
	if (isarray(in_arr)) { // [...], ...
		in_arr = new this.arr_type(in_arr)
	} else { // arr, ...
		check_arr_type(in_arr, this.arr_type)
	}
	check_arr_nc(in_arr, nc)
	offset = offset || 0
	in_offset = in_offset || 0
	assert(offset >= 0)
	assert(in_offset >= 0)
	len = check_arr_len(nc, in_arr, len, in_offset)
	let bpe = in_arr.BYTES_PER_ELEMENT

	gl.bindBuffer(gl.COPY_READ_BUFFER, this)
	gl.bufferSubData(gl.COPY_READ_BUFFER, offset * nc * bpe, in_arr, in_offset * nc, len * nc)

	this._len = max(this._len, offset + len)

	return this
}

buf.download = function(out_arr, offset, len, out_offset) {
	let gl = this
	let nc = this.n_components
	check_arr_type(out_arr, this.arr_type)
	check_arr_nc(out_arr, nc)
	offset = offset || 0
	out_offset = out_offset || 0
	assert(offset >= 0)
	assert(out_offset >= 0)
	if (len == null)
		len = this.len - offset // source dictates len, dest must accomodate.
	let bpe = out_arr.BYTES_PER_ELEMENT

	gl.bindBuffer(gl.COPY_READ_BUFFER, this)
	gl.getBufferSubData(gl.COPY_READ_BUFFER, offset * nc * bpe, out_arr, out_offset * nc, len * nc)

	return out_arr
}

buf.set = function(in_buf, offset, len, in_offset) {
	let gl = this.gl
	let nc = this.n_components
	check_arr_type(in_buf, this.arr_type)
	check_arr_nc(in_buf, nc)
	offset = offset || 0
	in_offset = in_offset || 0
	assert(offset >= 0)
	assert(out_offset >= 0)
	if (len == null)
		len = in_buf.len - in_offset
	let bpe = this.BYTES_PER_ELEMENT

	gl.bindBuffer(gl.COPY_READ_BUFFER, in_buf)
	gl.bindBuffer(gl.COPY_WRITE_BUFFER, this)
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
		is_dyn_buffer: true,
		gl: gl,
		arr_type: arr_type,
		n_components: n_components,
		instance_divisor: instance_divisor,
		normalize: normalize,
		for_index: for_index,
		buffer: null,
		buffer_replaced: noop,
	}

	db.grow_type = function(arg) {
		let arr_type1 = dyn_arr.index_arr_type(arg)
		if (arr_type1.BYTES_PER_ELEMENT <= arr_type.BYTES_PER_ELEMENT)
			return
		if (this.buffer) {
			let a1
			if (this.len > 0) {
				let a0 = this.buffer.download(this.buffer.arr())
				let a1 = new arr_type1(this.len)
				for (let i = 0, n = a0.length * n_components; i < n; i++)
					a1[i] = a0[i]
			}
			let cap = this.buffer.capacity
			this.buffer.free()
			this.buffer = gl.buffer(cap, arr_type1, n_components, instance_divisor, normalize, for_index)
			if (a1)
				this.buffer.upload(a1)
			this.buffer_replaced(this.buffer)
		}
		arr_type = arr_type1
		this.arr_type = arr_type1
	}

	db._grow = function(cap, pow2) {
		cap = max(0, cap)
		if ((this.buffer ? this.buffer.capacity : 0) < cap) {
			if (pow2 !== false)
				cap = nextpow2(cap)
			let b0 = this.buffer
			let b1 = gl.buffer(cap, arr_type, n_components, instance_divisor, normalize, for_index)
			if (b0) {
				b1.set(b0)
				b0.free()
			}
			this.buffer = b1
			this.buffer_replaced(b1)
		}
		return this
	}

	db.free = function() {
		this.buffer.free()
		this.buffer = null
	}

	property(db, 'len',
		function() {
			return db.buffer && db.buffer.len || 0
		},
		function(len) {
			len = max(0, len)
			let buffer = db._grow(len).buffer
			if (buffer)
				buffer.len = len
		}
	)

	if (data_or_cap != null) {
		if (isnum(data_or_cap)) {
			let cap = data_or_cap
			db._grow(cap)
		} else {
			let data = data_or_cap
			let len = data.length / n_components
			assert(len == floor(len), 'source array length not multiple of {0}', n_components)
			db.buffer = gl.buffer(data, arr_type, n_components, instance_divisor, normalize, for_index)
		}
	}

	return db
}

gl.dyn_index_buffer = function(data_or_cap, arr_type_or_max_idx) {
	let arr_type = index_arr_type(data_or_cap, arr_type_or_max_idx)
	return this.dyn_buffer(arr_type, data_or_cap, 1, null, false, true)
}

gl.dyn_arr_buffer = function(arr_type, data_or_cap, n_components, instance_divisor, normalize, for_index) {

	let dab = {is_dyn_arr_buffer: true}
	let db = this.dyn_buffer(arr_type, data_or_cap, n_components, instance_divisor, normalize, for_index)
	let da = dyn_arr(arr_type, data_or_cap, n_components)

	dab.buffer_replaced = noop
	db.buffer_replaced = function(b) { dab.buffer_replaced(b) }

	property(dab, 'len',
		function() { return db.len },
		function(len) { da.len = len }
	)

	dab.grow_type = function(arg) {
		da.grow_type(arg)
		db.grow_type(arg)
		return this
	}

	dab.set = function(in_arr, offset, len, in_offset) {
		da.set(in_arr, offset, len, in_offset)
		return this
	}

	dab.get = function(out_arr, offset, len, out_offset) {
		return da.get(out_arr, offset, len, out_offset)
	}

	dab.invalidate = function(offset, len) {
		da.invalidate(offset, len)
		return this
	}

	dab.upload = function() {
		db.len = da.len
		if (db.buffer)
			db.buffer.upload(da.array)
		da.validate()
		return this
	}

	dab.upload_invalid = function() {
		if (!da.invalid)
			return
		db.len = da.len
		db.buffer.upload(da.array, da.invalid_offset1, da.invalid_offset2 - da.invalid_offset1)
		da.validate()
		return this
	}

	property(dab, 'array', () => da.array)
	property(dab, 'buffer', () => db.buffer)

	return dab
}

gl.dyn_arr_index_buffer = function(data_or_cap, arr_type_or_max_idx) {
	let arr_type = index_arr_type(data_or_cap, arr_type_or_max_idx)
	return this.dyn_arr_buffer(arr_type, data_or_cap, 1, null, false, true)
}

// generate gl.*_buffer() APIs.
let buffer_types = {
	f32  : [f32arr,  1],
	u8   : [u8arr ,  1],
	u16  : [u16arr,  1],
	u32  : [u32arr,  1],
	i8   : [i8arr ,  1],
	i16  : [i16arr,  1],
	i32  : [i32arr,  1],
	v2   : [f32arr,  2],
	v3   : [f32arr,  3],
	v4   : [f32arr,  4],
	mat3 : [f32arr,  9],
	mat4 : [f32arr, 16],
}
for (let prefix in buffer_types) {
	let [arr_type, n_components] = buffer_types[prefix]
	gl[prefix+'_buffer'] = function buffer(data_or_cap, normalize) {
		return this.buffer(data_or_cap, arr_type, n_components, null, normalize)
	}
	gl[prefix+'_instance_buffer'] = function instance_buffer(data_or_cap, normalize) {
		return this.buffer(data_or_cap, arr_type, n_components, 1, normalize)
	}
	gl['dyn_'+prefix+'_buffer'] = function dyn_buffer(data_or_cap, normalize) {
		return this.dyn_buffer(arr_type, data_or_cap, n_components, null, normalize)
	}
	gl['dyn_'+prefix+'_instance_buffer'] = function dyn_instance_buffer(data_or_cap, normalize) {
		return this.dyn_buffer(arr_type, data_or_cap, n_components, 1, normalize)
	}
	gl['dyn_arr_'+prefix+'_buffer'] = function dyn_arr_buffer(data_or_cap, normalize) {
		return this.dyn_arr_buffer(arr_type, data_or_cap, n_components, null, normalize)
	}
	gl['dyn_arr_'+prefix+'_instance_buffer'] = function dyn_arr_instance_buffer(data_or_cap, normalize) {
		return this.dyn_arr_buffer(arr_type, data_or_cap, n_components, 1, normalize)
	}
}

// generate gl.*_index_buffer() APIs.
let index_buffer_types = {
	u8  : u8arr,
	u16 : u16arr,
	u32 : u32arr,
}
for (let prefix in index_buffer_types) {
	let arr_type = index_buffer_types[prefix]
	gl[prefix+'_index_buffer'] = function index_buffer(data_or_cap) {
		return this.index_buffer(data_or_cap, arr_type)
	}
	gl['dyn_'+prefix+'_index_buffer'] = function dyn_index_buffer(data_or_cap) {
		return this.dyn_index_buffer(data_or_cap, arr_type)
	}
	gl['dyn_arr_'+prefix+'_index_buffer'] = function dyn_arr_index_buffer(data_or_cap) {
		return this.dyn_arr_index_buffer(data_or_cap, arr_type)
	}
}

vao.dab = function(name, cap) {
	let vao = this
	let info = assert(vao.program.attr_info[name], 'invalid attribute {0}', name)
	let [arr_type, n_components] = buffer_types[info.buffer_type]
	let dab = vao.gl.dyn_arr_buffer(arr_type, cap, n_components)
	if (dab.buffer)
		vao.set_attr(name, dab.buffer)
	dab.buffer_replaced = function(b) { vao.set_attr(name, b) }
	return dab
}

gl.dyn_arr_vertex_buffer = function(attrs, cap) {

	let e = {dabs: {}, is_dyn_arr_vertex_buffer: true}

	let dab0
	for (let name in attrs) {
		let type = attrs[name]
		let [arr_type, n_components] = buffer_types[type]
		let dab = this.dyn_arr_buffer(arr_type, cap, n_components)
		e.dabs[name] = dab
		e[name] = dab
		dab0 = dab0 || dab
	}

	property(e, 'len',
		function() {
			return dab0.len
		},
		function(len) {
			for (let name in e.dabs) {
				let dab = e.dabs[name]
				dab.len = len
			}
		}
	)

	e.upload = function() {
		for (let name in e.dabs)
			e.dabs[name].upload()
	}

	e.to_vao = function(vao) {
		for (let name in e.dabs)
			vao.set_attr(name, e.dabs[name].buffer)
	}

	e.free = function() {
		for (let name in e.dabs)
			e.dabs[name].free()
	}

	return e
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
	assign(attr(attr(this, 'uniforms'), name, Array), args)
	return this
}

gl.draw = function(gl_mode, offset, count) {
	let gl = this
	let vao = gl.active_vao
	let ib = vao.index_buffer
	let n_inst = vao.instance_count
	offset = offset || 0
	if (ib) {
		if (count == null)
			count = ib.len
		if (n_inst != null) {
			// yes, we want gl.drawElementsInstancedBaseInstance(), I know...
			gl.drawElementsInstanced(gl_mode, count, ib.gl_type, offset, n_inst)
		} else {
			gl.drawElements(gl_mode, count, ib.gl_type, offset)
		}
	} else {
		if (count == null)
			count = vao.vertex_count
		if (n_inst != null) {
			gl.drawArraysInstanced(gl_mode, offset, count, n_inst)
		} else {
			gl.drawArrays(gl_mode, offset, count)
		}
	}
	return this
}

gl.draw_triangles = function(o, n) { let gl = this; return gl.draw(gl.TRIANGLES, o, n) }
gl.draw_points    = function(o, n) { let gl = this; return gl.draw(gl.POINTS   , o, n) }
gl.draw_lines     = function(o, n) { let gl = this; return gl.draw(gl.LINES    , o, n) }

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
	this.format = 'depth'
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
	this.format = 'rgba'
	this.attach = 'color'
	return this
}

tex.set_u32 = function(w, h, pixels, side) {
	let gl = this.gl
	this.bind()
	gl.texImage2D(tex_side_target(this, side), 0, gl.R32UI, w, h, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, pixels)
	this.w = w
	this.h = h
	this.format = 'u32'
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
	this.format = 'rgba'
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
	let tex = assert(this.attachment(attachment, color_unit))
	if (tex.format == 'rgba') {
		if (!buf) {
			buf = new u8arr(w * h * 4)
		} else {
			check_arr_type(buf, u8arr)
		}
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf)
	} else if (tex.format == 'u32') {
		if (!buf) {
			buf = new u32arr(w * h)
		} else {
			check_arr_type(buf, u32arr)
		}
		gl.readPixels(0, 0, w, h, gl.RED_INTEGER, gl.UNSIGNED_INT, buf)
	} else {
		assert(false, 'read_pixels NYI for {0} format', tex.format)
	}
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

fbo.attachment = function(target, color_unit) {
	return this.attachments && this.attachments[target + (color_unit || 0)]
}

let fbo_att = {
	color: gl.COLOR_ATTACHMENT0,
	depth: gl.DEPTH_ATTACHMENT,
	depth_stencil: gl.DEPTH_STENCIL_ATTACHMENT,
}
fbo.attach = function(tex_or_rbo, target, color_unit) {
	let gl = this.gl
	target = target || tex_or_rbo.attach
	color_unit = color_unit || 0
	let gl_attach = assert(fbo_att[target], 'invalid attachment target {0}', target) + color_unit
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

let _c = new f32arr(4)
let _u = new u32arr(4)
fbo.clear_color = function(color_unit, r, g, b, a) {
	let gl = this.gl
	assert(gl.draw_fbo == this, 'not the draw fbo')
	let tex = assert(this.attachment('color', color_unit))
	if (tex.format == 'rgba') {
		_c[0] = r
		_c[1] = g
		_c[2] = b
		_c[3] = or(a, 1)
		gl.clearBufferfv(gl.COLOR, color_unit, _c)
	} else if (tex.format == 'u32') {
		_u[0] = r
		gl.clearBufferuiv(gl.COLOR, color_unit, _u)
	} else {
		assert(false, 'clear_color NYI for {0} format', tex.format)
	}
}

fbo.clear_depth_stencil = function(depth, stencil) {
	let gl = this.gl
	assert(gl.draw_fbo == this, 'not the draw fbo')
	gl.clearBufferfi(gl.DEPTH_STENCIL, 0, or(depth, 1), or(stencil, 0))
}

}()) // module scope.
