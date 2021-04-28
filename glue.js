/*

	JavaScript "assorted lengths of wire" library.
	Written by Cosmin Apreutesei. Public domain.

	types:
		isobject(e)
		isarray(a)
		isstr(s)
		isnum(n)
		isbool(b)
		isfunc(f)
	logic:
		or(x, z)
		strict_or(x, z)
		repl(x, v, z)
	math:
		inf
		floor(x) ceil(x) round(x)
		abs(x)
		min(x, y) max(x, y)
		sqrt(x)
		random()
		PI sin(x) cos(x) tan(x) rad deg
		clamp(x, x0, x1)
		sign(x)
		strict_sign(x)
		lerp(x, x0, x1, y0, y1)
		num(s, z)
		mod(a, b)
		nextpow2(x)
	callback stubs:
		noop
		return_true
		return_false
		return_arg
		assert_false
	error handling:
		print()
		warn()
		debug()
		trace()
		assert(v, err, ...) -> v
		stacktrace()
	extending built-in objects:
		property(cls, prop, descriptor | get,set)
		method(cls, method, func)
		override(cls, method, func)
		alias(cls, new_name, old_name)
		override_property_setter(cls, prop, set)
	strings:
		s.subst('{0} {1}', a0, a1, ...)
		s.starts(s)
		s.ends(s)
		s.upper()
		s.lower()
	arrays:
		empty_array
		a.extend(a1)
		a.insert(i, v)
		a.remove(i) -> v
		a.remove_value(v) -> i
		a.remove_values(cond)
		a.last
		a.binsearch(v, cmp, i1, i2)
	hash maps:
		set()
		map()
		empty
		keys(t)
		assign(dt, t1, ...)
		assign_opt(dt, t1, ...)
		attr(t, k[, cons])
		memoize(f)
	typed arrays:
		[dyn_][f32|i8|u8|i16|u16|i32|u32]arr(arr|[...]|capacity, [nc])
			set(in_arr, [offset=0], [len], [in_offset=0])
			invalidate([offset=0], [len])
			grow(cap, [preserve_contents=true], [pow2=true])
			grow_type(arr_type|max_index|[...]|arr, [preserve_contents=true])
			setlen(len)
	events:
		events_mixin(o)
	timestamps:
		time()
		time(y, m, d, H, M, s, ms)
		time(date_str)
		day   (ts[, offset])
		month (ts[, offset])
		year  (ts[, offset])
		week  (ts[, offset])
		days(delta_ts)
		year_of      (ts)
		month_of     (ts)
		month_day_of (ts)
		locale
		weekday_name(ts, ['long'])
		month_name(ts, ['long'])
		month_year(ts, ['long'])
		week_start_offset()
	colors:
		hsl_to_rgb(h, s, L)
	geometry:
		point_around(cx, cy, r, angle)
	timers:
		after(t, f)
		every(t, f)
		clock()
		timer(f)
	serialization:
		json(t) -> s
	url decoding, encoding and updating:
		url(path) -> t
		url(path|path_comp, [path_comp], [params]) -> s
	ajax requests:
		ajax({
			url: s,
			upload: json|s, ...,
			success: f(json|res),
			fail: f('http'|'timeout'|'network'|'abort'[, status, msg, body]),
			done: f('success'|'fail', ...),
			...
		}) -> req

*/

// types ---------------------------------------------------------------------

isobject = e => e != null && typeof e == 'object'
isarray = Array.isArray
isstr = s => typeof s == 'string'
isnum = n => typeof n == 'number'
isbool = b => typeof b == 'boolean'
isfunc = f => typeof f == 'function'

// logic ---------------------------------------------------------------------

// non-shortcircuiting `||` operator for which only `undefined` and `null` are falsey.
function or(x, z) { return x != null ? x : z }

// non-shortcircuiting `||` operator for which only `undefined` is falsey.
function strict_or(x, z) { return x !== undefined ? x : z }

// single-value filter.
function repl(x, v, z) { return x === v ? z : x }

// math ----------------------------------------------------------------------

inf = Infinity
floor = Math.floor
ceil = Math.ceil
round = Math.round
abs = Math.abs
min = Math.min
max = Math.max
sqrt = Math.sqrt
random = Math.random
log = Math.log
sign = Math.sign

// NOTE: returns x1 if x1 < x0, which enables the idiom
// `a[clamp(i, 0, b.length-1)]` to return undefined when b is empty.
function clamp(x, x0, x1) {
	return min(max(x, or(x0, -1/0)), or(x1, 1/0))
}

// sign() that only returns -1 or 1, never 0, and returns -1 for -0.
function strict_sign(x) {
	return 1/x == 1/-0 ? -1 : (x >= 0 ? 1 : -1)
}

function lerp(x, x0, x1, y0, y1) {
	return y0 + (x-x0) * ((y1-y0) / (x1 - x0))
}

function num(s, z) {
	let x = parseFloat(s)
	return x != x ? z : x
}

// % that works with negative numbers.
function mod(a, b) {
	return (a % b + b) % b
}

function nextpow2(x) {
	return max(0, 2**(ceil(log(x) / log(2))))
}


PI  = Math.PI
sin = Math.sin
cos = Math.cos
tan = Math.tan
rad = PI / 180
deg = 180 / PI

asin  = Math.asin
acos  = Math.acos
atan  = Math.atan
atan2 = Math.atan2

// callback stubs ------------------------------------------------------------

function noop() {}
function return_true() { return true; }
function return_false() { return false; }
function return_arg(arg) { return arg; }

// error handling ------------------------------------------------------------

print = console.log
warn  = print
debug = print
trace = console.trace

function assert(ret, err, ...args) {
	if (ret == null || ret === false) {
		throw ((err && err.subst(...args) || 'assertion failed'))
	}
	return ret
}

function stacktrace() {
	try {
		throw new Error()
	} catch(e) {
		return e.stack
	}
}

// extending built-in objects ------------------------------------------------

// extend an object with a property, checking for upstream name clashes.
function property(cls, prop, get, set) {
	let proto = cls.prototype || cls
	assert(!(prop in proto), '{0}.{1} already exists', cls.name, prop)
	let descriptor = isobject(get) ? get : {get: get, set: set}
	Object.defineProperty(proto, prop, descriptor)
}

// extend an object with a method, checking for upstream name clashes.
// NOTE: does not actually create methods but "data properties" which happen
// to have their "value" be a function object. These can be called like
// methods but come before methods in the look-up chain!
function method(cls, meth, func) {
	property(cls, meth, {
		value: func,
		enumerable: false,
	})
}

function override(cls, meth, func) {
	let proto = cls.prototype || cls
	let inherited = proto[meth] || noop
	function wrapper(...args) {
		return func.call(this, inherited, ...args)
	}
	Object.defineProperty(proto, meth, {
		value: wrapper,
		enumerable: false,
	})
}

function getRecursivePropertyDescriptor(obj, key) {
	return Object.prototype.hasOwnProperty.call(obj, key)
		? Object.getOwnPropertyDescriptor(obj, key)
		: getRecursivePropertyDescriptor(Object.getPrototypeOf(obj), key)
}
method(Object, 'getPropertyDescriptor', function(key) {
	return key in this && getRecursivePropertyDescriptor(this, key)
})

function alias(cls, new_name, old_name) {
	let proto = cls.prototype || cls
	let d = proto.getPropertyDescriptor(old_name)
	assert(d, '{0}.{1} does not exist', cls.name, old_name)
	Object.defineProperty(proto, new_name, d)
}

function override_property_setter(cls, prop, set) {
	let proto = cls.prototype || cls
	let d0 = proto.getPropertyDescriptor(prop)
	assert(d0, '{0}.{1} does not exist', cls.name, prop)
	let inherited = d0.set || noop
	function wrapper(v) {
		return set.call(this, inherited, v)
	}
	d0.set = wrapper
	Object.defineProperty(proto, prop, d0)
}

// strings -------------------------------------------------------------------

// usage:
//		'{1} of {0}'.subst(total, current)
//		'{1} of {0}'.subst([total, current])
//		'{current} of {total}'.subst({'current': current, 'total': total})

method(String, 'subst', function(...args) {
	if (!args.length)
		return this.toString()
	if (isarray(args[0]))
		args = args[0]
	if (isobject(args[0]))
		args = args[0]
	return this.replace(/{(\w+)}/g, (match, s) => args[s])
})

alias(String, 'starts', 'startsWith')
alias(String, 'ends'  , 'endsWith')
alias(String, 'upper' , 'toUpperCase')
alias(String, 'lower' , 'toLowerCase')

// stub for getting message strings that can be translated multiple languages.
S = window.S || function S(label, msg) { return msg }

// arrays --------------------------------------------------------------------

empty_array = []

method(Array, 'extend', function(a) {
	let i0 = this.length
	let n = a.length
	this.length += n
	for (let i = 0; i < n; i++)
		this[i0+i] = a[i]
	return this
})

method(Array, 'set', function(a) {
	let n = a.length
	this.length = n
	for (let i = 0; i < n; i++)
		this[i] = a[i]
	return this
})

method(Array, 'insert', function(i, v) {
	if (i == null)
		this.push(v)
	else if (i >= this.length)
		this[i] = v
	else
		this.splice(i, 0, v)
	return this
})

method(Array, 'remove', function(i) {
	return this.splice(i, 1)[0]
})

method(Array, 'remove_value', function(v) {
	let i = this.indexOf(v)
	if (i != -1)
		this.splice(i, 1)
	return i
})

method(Array, 'remove_values', function(cond) {
	let i = 0, j = 0
	while (i < this.length) {
		let v = this[i]
		if (!cond(v, i, this))
			this[j++] = v
		i++
	}
	this.length = j
})

// move the n elements at i1 to a new position which is an index in the
// array as it stands after the removal of the elements to be moved.
method(Array, 'move', function(i1, n, insert_i) {
	this.splice(insert_i, 0, ...this.splice(i1, n))
})

property(Array, 'last', {
	get: function() { return this[this.length-1] },
	set: function(v) { this[this.length-1] = v }
})

method(Array, 'equals', function(a, i0, i1) {
	i0 = i0 || 0
	i1 = i1 || max(this.length, a.length)
	for (let i = i0; i < i1; i++)
		if (this[i] !== a[i])
			return false
	return true
})

// binary search for an insert position that keeps the array sorted.
// using '<' gives the first insert position, while '<=' gives the last.
{
	let cmps = {}
	cmps['<' ] = ((a, b) => a <  b)
	cmps['>' ] = ((a, b) => a >  b)
	cmps['<='] = ((a, b) => a <= b)
	cmps['>='] = ((a, b) => a >= b)
	method(Array, 'binsearch', function(v, cmp, i1, i2) {
		let lo = or(i1, 0) - 1
		let hi = or(i2, this.length)
		cmp = cmps[cmp || '<'] || cmp
		while (lo + 1 < hi) {
			let mid = (lo + hi) >> 1
			if (cmp(this[mid], v))
				lo = mid
			else
				hi = mid
		}
		return hi
	})
}

// hash maps -----------------------------------------------------------------

set = (iter) => new Set(iter)
map = (iter) => new Map(iter)

empty = {}

keys = Object.keys

assign = Object.assign

// like Object.assign() but skips assigning `undefined` values.
function assign_opt(dt, ...args) {
	for (let arg of args)
		if (arg != null)
			for (let k in arg)
				if (arg.hasOwnProperty(k))
					if (arg[k] !== undefined)
						dt[k] = arg[k]
	return dt
}

function attr(t, k, cons) {
	cons = cons || Object
	let v = (t instanceof Map) ? t.get(k) : t[k]
	if (v === undefined) {
		v = new cons()
		if (t instanceof Map)
			t.set(k, v)
		else
			t[k] = v
	}
	return v
}

// TOOD: multi-arg memoize.
function memoize(f) {
	let t = new Map()
	return function(x) {
		if (t.has(x))
			return t.get(x)
		else {
			let y = f(x)
			t.set(x, y)
			return y
		}
	}
}

// typed arrays --------------------------------------------------------------

f32arr = Float32Array
i8arr  = Int8Array
u8arr  = Uint8Array
i16arr = Int16Array
u16arr = Uint16Array
i32arr = Int32Array
u32arr = Uint32Array

function max_index_from_array(a) {
	if (a.max_index != null) // hint
		return a.max_index
	let max_idx = 0
	for (let idx of a)
		max_idx = max(max_idx, idx)
	return max_idx
}

function arr_type_from_max_index(max_idx) {
	return max_idx > 65535 && u32arr || max_idx > 255 && u16arr || u8arr
}

// for inferring the data type of gl.ELEMENT_ARRAY_BUFFER VBOs.
function index_arr_type(arg) {
	if (isnum(arg)) // max_idx
		return arr_type_from_max_index(arg)
	if (isarray(arg)) // [...]
		return arr_type_from_max_index(max_index_from_array(arg))
	if (arg.BYTES_PER_ELEMENT) // arr | arr_type
		return arg.constructor.prototype == arg.__proto__ ? arg.constructor : arg
	return assert(arg, 'arr_type required')
}

class dyn_arr_class {

	// NOTE: `nc` is "number of components" useful for storing compound values
	// without having to compute offsets and lengths manually.

	constructor(arr_type, data_or_cap, nc) {
		this.arr_type = arr_type
		this.nc = nc || 1
		this.inv_nc = 1 / this.nc
		this.array = null
		this.invalid = false
		this.invalid_offset1 = null
		this.invalid_offset2 = null

		if (data_or_cap != null) {
			if (isnum(data_or_cap)) {
				let cap = data_or_cap
				this.grow(cap, false, false)
			} else if (data_or_cap) {
				let data = data_or_cap
				let data_len = data.length * this.inv_nc
				assert(data_len == floor(data_len),
					'source array length not multiple of {0}', this.nc)
				this.array = data
				this.array.len = data_len
			}
		}

	}

	grow(cap, preserve_contents, pow2) {
		cap = max(0, cap)
		if (this.capacity < cap) {
			if (pow2 !== false)
				cap = nextpow2(cap)
			let array = new this.arr_type(cap * this.nc)
			array.nc = this.nc
			array.len = this.len
			if (preserve_contents !== false && this.array)
				array.set(this.array)
			this.array = array
		}
		return this
	}

	grow_type(arg, preserve_contents) {
		let arr_type1 = index_arr_type(arg)
		if (arr_type1.BYTES_PER_ELEMENT <= this.arr_type.BYTES_PER_ELEMENT)
			return
		if (this.array) {
			let this_len = this.len
			let array1 = new arr_type1(this.capacity)
			if (preserve_contents !== false)
				for (let i = 0, n = this_len * this.nc; i < n; i++)
					array1[i] = this.array[i]
			array1.nc = this.nc
			array1.len = this_len
			this.array = array1
		}
		this.arr_type = arr_type1
		return this
	}

	set(offset, data, len, data_offset) {

		// check/clamp/slice source.
		data_offset = data_offset || 0
		let data_len
		if (data.nc != null) {
			assert(data.nc == this.nc, 'source array nc is {0}, expected {1}', data.nc, this.nc)
			data_len = or(data.len, data.length)
		} else {
			data_len = data.length * this.inv_nc
			assert(data_len == floor(data_len), 'source array length not multiple of {0}', this.nc)
		}
		assert(data_offset >= 0 && data_offset <= data_len, 'source offset out of range')
		len = clamp(or(len, 1/0), 0, data_len - data_offset)
		if (data_offset != 0 || len != data_len) // gotta make garbage here...
			data = data.subarray(data_offset * this.nc, (data_offset + len) * this.nc)

		assert(offset >= 0, 'offset out of range')

		this.setlen(max(this.len, offset + len))
		this.array.set(data, offset * this.nc)
		this.invalidate(offset, len)

		return this
	}

	remove(offset, len) {
		assert(offset >= 0, 'offset out of range')
		len = max(0, min(or(len, 1), this.len - offset))
		if (len == 0)
			return
		for (let a = this.array, o1 = offset, o2 = offset + len, i = 0; i < len; i++)
			a[o1+i] = a[o2+i]
		this._len -= len
		this.invalidate(offset)
		return this
	}

	setlen(len) {
		len = max(0, len)
		let arr = this.grow(len).array
		if (arr)
			arr.len = len
		if (this.invalid) {
			this.invalid_offset1 = min(this.invalid_offset1, len)
			this.invalid_offset2 = min(this.invalid_offset2, len)
		}
		return this
	}

	invalidate(offset, len) {
		let o1 = max(0, offset || 0)
		len = max(0, or(len, 1/0))
		let o2 = min(o1 + len, this.len)
		o1 = min(or(this.invalid_offset1,  1/0), o1)
		o2 = max(or(this.invalid_offset2, -1/0), o2)
		this.invalid = true
		this.invalid_offset1 = o1
		this.invalid_offset2 = o2
		return this
	}

	validate() {
		this.invalid = false
		this.invalid_offset1 = null
		this.invalid_offset2 = null
	}

}

property(dyn_arr_class, 'capacity',
	function() { return this.array ? this.array.length * this.inv_nc : 0 },
)

property(dyn_arr_class, 'len',
	function() { return this.array ? this.array.len : 0 },
	function(len) { this.setlen(len) }
)

function dyn_arr(arr_type, data_or_cap, nc) {
	return new dyn_arr_class(arr_type, data_or_cap, nc)
}

dyn_arr.index_arr_type = index_arr_type

{
	let dyn_arr_func = function(arr_type) {
		return function(data_or_cap, nc) {
			return new dyn_arr_class(arr_type, data_or_cap, nc)
		}
	}
	dyn_f32arr = dyn_arr_func(f32arr)
	dyn_i8arr  = dyn_arr_func(i8arr)
	dyn_u8arr  = dyn_arr_func(u8arr)
	dyn_i16arr = dyn_arr_func(i16arr)
	dyn_u16arr = dyn_arr_func(u16arr)
	dyn_i32arr = dyn_arr_func(i32arr)
	dyn_u32arr = dyn_arr_func(u32arr)
}

// data structures -----------------------------------------------------------

function freelist(create, init, destroy) {
	let e = []
	e.alloc = function() {
		let e = this.pop()
		if (e)
			init(e)
		else
			e = create()
		return e
	}
	e.release = function(e) {
		destroy(e)
		this.push(e)
	}
	return e
}

// dynamic array with stable element indices.
function stable_index_array(I) {
	I = I || 'i'
	let e = []
	let free = []
	e.add = function(e) {
		let i = free.pop()
		if (i == null)
			i = this.length
		this[i] = e
		e[I] = i
		return e
	}
	e.remove = function(e) {
		assert(e[I] != null)
		free.push(e[I])
		this[i] = undefined
		e[I] = null
		return e
	}
	e.clear = function() {
		for (let e of this)
			if (e)
				e[I] = null
		this.length = 0
		free.length = 0
	}
	return e
}

// stack with freelist.
function freelist_stack(create, init, destroy) {
	let e = {}
	let stack = []
	let fl = freelist(create, init, destroy)
	e.push = function() {
		let e = fl.alloc()
		stack.push(e)
		return e
	}
	e.pop = function() {
		let e = stack.pop()
		fl.release(e)
		return e
	}
	e.clear = function() {
		while (this.pop());
	}
	e.stack = stack
	return e
}

// events --------------------------------------------------------------------

function events_mixin(o) {
	let obs = new Map()
	o.on = function(topic, handler, enable) {
		assert(enable === undefined || typeof enable == 'boolean')
		if (enable !== undefined && enable !== true)
			return o.off(topic, handler)
		if (!handler)
			return
		let handlers = obs.get(topic)
		if (!handlers) {
			handlers = []
			obs.set(topic, handlers)
		}
		handlers.push(handler)
	}
	o.off = function(topic, handler) {
		let handlers = obs.get(topic)
		if (handlers)
			if (handler)
				handlers.remove_value(handler)
			else
				handlers.clear()
	}
	o.once = function(topic, handler) {
		let wrapper = function(...args) {
			let ret = handler(...args)
			o.off(topic, wrapper)
			return ret
		}
		o.on(topic, wrapper)
	}
	o.fire = function(topic, ...args) {
		var a = obs.get(topic)
		if (!a) return
		for (let f of a) {
			let ret = f.call(o, ...args)
			if (ret !== undefined)
				return ret
		}
	}
	return o
}

// timestamps ----------------------------------------------------------------

_d = new Date() // public temporary date object.

// NOTE: months start at 1, and seconds can be fractionary.
function time(y, m, d, H, M, s) {
	if (isnum(y)) {
		_d.setFullYear(y)
		_d.setMonth(or(m, 1) - 1)
		_d.setDate(or(d, 1))
		_d.setHours(H || 0)
		_d.setMinutes(M || 0)
		s = s || 0
		_d.setSeconds(s)
		_d.setMilliseconds((s - floor(s)) * 1000)
		return _d.valueOf() / 1000
	} else if (isstr(y)) {
		return Date.parse(y) / 1000
	} else if (y == null) {
		return Date.now() / 1000
	} else {
		assert(false)
	}
}

// get the time at the start of the day of a given time, plus/minus a number of days.
function day(t, offset) {
	_d.setTime(t * 1000)
	_d.setMilliseconds(0)
	_d.setSeconds(0)
	_d.setMinutes(0)
	_d.setHours(0)
	_d.setDate(_d.getDate() + (offset || 0))
	return _d.valueOf() / 1000
}

// get the time at the start of the month of a given time, plus/minus a number of months.
function month(t, offset) {
	_d.setTime(t * 1000)
	_d.setMilliseconds(0)
	_d.setSeconds(0)
	_d.setMinutes(0)
	_d.setHours(0)
	_d.setDate(1)
	_d.setMonth(_d.getMonth() + (offset || 0))
	return _d.valueOf() / 1000
}

// get the time at the start of the year of a given time, plus/minus a number of years.
function year(t, offset) {
	_d.setTime(t * 1000)
	_d.setMilliseconds(0)
	_d.setSeconds(0)
	_d.setMinutes(0)
	_d.setHours(0)
	_d.setDate(1)
	_d.setMonth(0)
	_d.setFullYear(_d.getFullYear() + (offset || 0))
	return _d.valueOf() / 1000
}

// get the time at the start of the week of a given time, plus/minus a number of weeks.
function week(t, offset) {
	_d.setTime(t * 1000)
	_d.setMilliseconds(0)
	_d.setSeconds(0)
	_d.setMinutes(0)
	_d.setHours(0)
	let days = -_d.getDay() + week_start_offset()
	if (days > 0) days -= 7
	_d.setDate(_d.getDate() + days + (offset || 0) * 7)
	return _d.valueOf() / 1000
}

function days(dt) {
	return dt / (3600 * 24)
}

function year_of      (t) { _d.setTime(t * 1000); return _d.getFullYear() }
function month_of     (t) { _d.setTime(t * 1000); return _d.getMonth() + 1 }
function month_day_of (t) { _d.setTime(t * 1000); return _d.getDay() }

locale = navigator.language

{
	let wd = {short: {}, long: {}}

	for (let i = 0; i < 7; i++) {
		_d.setTime(1000 * 3600 * 24 * (3 + i))
		for (how of ['short', 'long'])
			wd[how][i] = _d.toLocaleDateString(locale, {weekday: how, timeZone: 'UTC'})
	}

	function weekday_name(t, how) {
		_d.setTime(t * 1000)
		return wd[how || 'short'][_d.getDay()]
	}

	function month_name(t, how) {
		_d.setTime(t * 1000)
		return _d.toLocaleDateString(locale, {month: how || 'short'})
	}

	function month_year(t, how) {
		_d.setTime(t * 1000)
		return _d.toLocaleDateString(locale, {month: how || 'short', year: 'numeric'})
	}
}

// no way to get OS locale in JS in 2020. I hate the web.
function week_start_offset() {
	return locale.starts('en') ? 0 : 1
}

// colors --------------------------------------------------------------------

{

// hsl is in (0..360, 0..1, 0..1); rgb is #rrggbb
let h2rgb = function(m1, m2, h) {
	if (h < 0) h = h+1
	if (h > 1) h = h-1
	if (h*6 < 1)
		return m1+(m2-m1)*h*6
	else if (h*2 < 1)
		return m2
	else if (h*3 < 2)
		return m1+(m2-m1)*(2/3-h)*6
	else
		return m1
}

let hex = x => round(255 * x).toString(16).padStart(2, '0')

function hsl_to_rgb(h, s, L) {
	h = h / 360
	let m2 = L <= .5 ? L*(s+1) : L+s-L*s
	let m1 = L*2-m2
	return '#' +
		hex(h2rgb(m1, m2, h+1/3)) +
		hex(h2rgb(m1, m2, h)) +
		hex(h2rgb(m1, m2, h-1/3))
}

function hex3(x) {
	return x != null && (
		((x >> 16) & 0xff).toString(16).padStart(2, '0') +
		((x >>  8) & 0xff).toString(16).padStart(2, '0') +
		( x        & 0xff).toString(16).padStart(2, '0')
	)
}

function hex4(x) {
	return x != null && (
		((x >> 24) & 0xff).toString(16).padStart(2, '0') +
		((x >> 16) & 0xff).toString(16).padStart(2, '0') +
		((x >>  8) & 0xff).toString(16).padStart(2, '0') +
		( x        & 0xff).toString(16).padStart(2, '0')
	)
}

}

// geometry ------------------------------------------------------------------

// point at a specified angle on a circle.
function point_around(cx, cy, r, angle) {
	angle = rad * angle
	return [
		cx + cos(angle) * r,
		cy + sin(angle) * r
	]
}

// timers --------------------------------------------------------------------

function after(t, f) { return setTimeout(f, t * 1000) }
function every(t, f) { return setInterval(f, t * 1000) }

function clock() { return performance.now() / 1000 }

function timer(f) {
	let timer_id
	function wrapper() {
		timer_id = null
		f()
	}
	return function(t) {
		if (timer_id != null) {
			clearTimeout(timer_id)
			timer_id = null
		}
		if (t != null && t !== false)
			timer_id = after(t, wrapper)
	}
}

// serialization -------------------------------------------------------------

json = JSON.stringify

// clipboard -----------------------------------------------------------------

function copy_text(text, done) {
	return navigator.clipboard.writeText(text).then(done)
}

/* URL encoding & decoding ---------------------------------------------------

	url(path) -> t
	url(path|path_comp, [path_comp], [params]) -> s

	examples:
		decode: url('a/b?k=v') -> {path: ['a','b'], params: {k:'v'}}
		encode: url(['a','b'], {k:'v'}) -> 'a/b?k=v'
		update: url('a/b', {k:'v'}) -> 'a/b?k=v'
		update: url('a/b?k=v', ['c'], {k:'x'}) -> 'c/b?k=x'

*/
function url(path, params, update) {
	if (typeof path == 'string') { // decode or update
		if (params !== undefined || update !== undefined) { // update
			if (!isarray(params)) { // update params only
				update = params
				params = undefined
			}
			let t = url(path) // decode
			if (params) // update path
				for (let i = 0; i < params.length; i++)
					t.path[i] = params[i]
			if (update) // update params
				for (let k in update)
					t.params[k] = update[k]
			return url(t.path, t.params) // encode back
		} else { // decode
			let i = path.indexOf('?')
			if (i > -1) {
				params = path.substring(i + 1)
				path = path.substring(0, i)
			}
			let a = path.split('/')
			for (let i = 0; i < a.length; i++)
				a[i] = decodeURIComponent(a[i])
			let t = {}
			if (params !== undefined) {
				params = params.split('&')
				for (let i = 0; i < params.length; i++) {
					let kv = params[i].split('=')
					let k = decodeURIComponent(kv[0])
					let v = kv.length == 1 ? true : decodeURIComponent(kv[1])
					if (t[k] !== undefined) {
						if (isarray(t[k]))
							t[k] = [t[k]]
						t[k].push(v)
					} else {
						t[k] = v
					}
				}
			}
			return {path: a, params: t}
		}
	} else { // encode
		if (!isarray(path)) {
			params = path.params
			path = path.path
		}
		let a = []
		for (let i = 0; i < path.length; i++)
			a[i] = encodeURIComponent(path[i])
		path = a.join('/')
		a = []
		let pkeys = keys(params).sort()
		for (let i = 0; i < pkeys.length; i++) {
			let pk = pkeys[i]
			let k = encodeURIComponent(pk)
			let v = params[pk]
			if (isarray(v)) {
				for (let j = 0; j < v.length; j++) {
					let z = v[j]
					let kv = k + (z !== true ? '=' + encodeURIComponent(z) : '')
					a.push(kv)
				}
			} else {
				let kv = k + (v !== true ? '=' + encodeURIComponent(v) : '')
				a.push(kv)
			}
		}
		params = a.join('&')
		return path + (params ? '?' + params : '')
	}
}

/* AJAX requests -------------------------------------------------------------

	ajax(opt) -> req
		opt.url
		opt.upload: object (sent as json) | s
		opt.timeout
		opt.method ('POST' or 'GET' based on req.upload)
		opt.slow_timeout (4)
		opt.headers: {h->v}
		opt.user
		opt.pass
		opt.async (true)
		opt.dont_send (false)

	req.send()
	req.abort()

	^slow(show|hide)
	^progress(p, loaded, [total])
	^upload_progress(p, loaded, [total])
	^success(res)
	^fail('timeout'|'network'|'abort')
	^fail('http', status, message, body_text)
	^done('success' | 'fail', ...)

*/
function ajax(req) {

	req = update({slow_timeout: 4}, req)
	events_mixin(req)

	let xhr = new XMLHttpRequest()

	let method = req.method || (req.upload ? 'POST' : 'GET')
	let async = req.async !== false // NOTE: this is deprecated but that's ok.

	xhr.open(method, req.url, async, req.user, req.pass)

	let upload = req.upload
	if (typeof upload == 'object') {
		upload = json(upload)
		xhr.setRequestHeader('content-type', 'application/json')
	}

	if (async)
		xhr.timeout = (req.timeout || 0) * 1000

	if (req.headers)
		for (let h of headers)
			xhr.setRequestHeader(h, headers[h])

	let slow_watch

	function stop_slow_watch() {
		if (slow_watch) {
			clearTimeout(slow_watch)
			slow_watch = null
		}
		if (slow_watch === false) {
			req.fire('slow', false)
			slow_watch = null
		}
	}

	function slow_expired() {
		req.fire('slow', true)
		slow_watch = false
	}

	req.send = function() {
		slow_watch = after(req.slow_timeout, slow_expired)
		xhr.send(upload)
		return req
	}

	// NOTE: only Firefox fires progress events on non-200 responses.
	xhr.onprogress = function(ev) {
		if (ev.loaded > 0)
			stop_slow_watch()
		let p = ev.lengthComputable ? ev.loaded / ev.total : .5
		req.fire('progress', p, ev.loaded, ev.total)
	}

	xhr.upload.onprogress = function(ev) {
		if (ev.loaded > 0)
			stop_slow_watch()
		let p = ev.lengthComputable ? ev.loaded / ev.total : .5
		req.fire('upload_progress', p, ev.loaded, ev.total)
	}

	xhr.ontimeout = function() {
		req.fail = 'timeout'
		req.fire('fail', 'timeout')
		req.fire('done', 'fail', 'timeout')
	}

	// NOTE: only fired on network errors like connection refused!
	xhr.onerror = function() {
		req.fail = 'network'
		req.fire('fail', 'network')
		req.fire('done', 'fail', 'network')
	}

	xhr.onabort = function() {
		req.fail = 'abort'
		req.fire('fail', 'abort')
		req.fire('done', 'fail', 'abort')
	}

	xhr.onreadystatechange = function(ev) {
		if (xhr.readyState > 1)
			stop_slow_watch()
		if (xhr.readyState == 4) {
			if (xhr.status == 200) {
				let res = xhr.response
				if (!xhr.responseType || xhr.responseType == 'text')
					if (xhr.getResponseHeader('content-type') == 'application/json' && res)
						res = JSON.parse(res)
				req.response = res
				req.fire('success', res)
				req.fire('done', 'success', res)
			} else if (xhr.status) { // status is 0 for network errors, incl. timeout.
				req.fail = 'http'
				req.fire('fail', 'http', xhr.status, xhr.statusText, xhr.responseText)
				req.fire('done', 'fail', 'http', xhr.status, xhr.statusText, xhr.responseText)
			}
		}
	}

	req.abort = function() {
		xhr.abort()
		return req
	}

	req.on('slow', req.slow)
	req.on('progress', req.progress)
	req.on('upload_progress', req.upload_progress)
	req.on('done', req.done)
	req.on('fail', req.fail)
	req.on('success', req.success)

	req.xhr = xhr

	req.error_message = function(type, status, message, body) {
		if (type == 'http')
			return S('error_http', 'Server returned {0} {1}').subst(status, message)
		else if (type == 'network')
			return S('error_load_network', 'Loading failed: network error.')
		else if (type == 'timeout')
			return S('error_load_timeout', 'Loading failed: timed out.')
	}

	if (!req.dont_send)
		req.send()

	return req
}

