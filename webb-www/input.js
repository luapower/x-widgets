/*
	Input-type widgets.
	Written by Cosmin Apreutesei. Public Domain.

*/

input = component('x-input', function(e, t) {

	function init() {
		create_view()
	}

	function get_value() {
		return e.from_text(this.input.value)
	}

	function set_value(v) {
		if (!e.validate(v))
			return
		v = e.to_text(v)
		if (this.input.value === v)
			return
		this.input.value = v
		this.input.fire(new Event('input'))
	}

	property(e, 'value', {get: get_value, set: set_value})

	// view

	function create_view() {
		e.class('x-widget')
		e.class('x-input')
		e.tooltip = H.div({class: 'x-input-error-ct'}, H.div({class: 'x-input-error'}))
		e.tooltip.style.display = 'none'
		e.input = H.input({class: 'x-input-input'})
		e.input.set_input_filter() // must be set as first event handler!
		e.input.on('input', input_input)
		e.input.on('focus', input_focus)
		e.input.on('blur', input_blur)
		e.add(e.input, e.tooltip)
	}

	function input_input() {
		let v = e.from_text(e.value)
		let err = e.validate(v)
		e.invalid = err != true
		e.input.class('x-input-invalid', e.invalid)
		e.error = e.invalid && err || ''
		e.tooltip.at[0].innerHTML = e.error
		e.tooltip.style.display = e.error ? null : 'none'
		if (e.invalid)
			return false
	}

	function input_focus() {
		e.tooltip.style.display = e.error ? null : 'none'
	}

	function input_blur() {
		e.tooltip.style.display = 'none'
	}

	e.validate = function(v) {
		return true
	}

	e.to_text = function(v) {
		return String(v)
	}

	e.from_text = function(s) {
		return s
	}

	init()

})

spin_input = component('x-spin-input', input, function(e, t) {

	// model

	e.step = t.step || 1
	e.min  = t.min || -1/0
	e.max  = t.max ||  1/0

	// view

	attr_property(e, 'button-style', 'plus-minus')
	attr_property(e, 'button-placement', 'auto')

	e.classes = 'x-spin-input'

	let bs = t.button_style || e.button_style
	let bp = t.button_placement || e.button_placement; bp = bp != 'auto' && bp
	if (bs == 'plus-minus') {
		e.up   = H.div({class: 'x-spin-input-button fa fa-plus'})
		e.down = H.div({class: 'x-spin-input-button fa fa-minus'})
		bp = bp || 'each-side'
	} else if (bs == 'up-down') {
		e.up   = H.div({class: 'x-spin-input-button fa fa-caret-up'})
		e.down = H.div({class: 'x-spin-input-button fa fa-caret-down'})
		bp = bp || 'left'
	} else if (bs == 'left-right') {
		e.up   = H.div({class: 'x-spin-input-button fa fa-caret-right'})
		e.down = H.div({class: 'x-spin-input-button fa fa-caret-left'})
		bp = bp || 'each-side'
	}
	if (bp == 'each-side') {
		e.insert(0, e.down)
		e.add(e.up)
		e.down.class('x-spin-input-button-left' )
		e.up  .class('x-spin-input-button-right')
	} else if (bp == 'right') {
		e.add(e.down, e.up)
		e.down.class('x-spin-input-button-right')
		e.up  .class('x-spin-input-button-right')
	} else if (bp == 'left') {
		e.insert(0, e.down, e.up)
		e.down.class('x-spin-input-button-left')
		e.up  .class('x-spin-input-button-left')
	}

	// controller

	e.input.input_filter = function(v) {
		return /^[\-]?\d*\.?\d*$/.test(v) // allow digits and '.' only
	}

	e.validate = function(v) {
		return v >= e.min && v <= e.max && v % e.step == 0
	}

	e.from_text = function(s) {
		return Number(s)
	}

	e.to_text = function(x) {
		return String(x)
	}

	let increment
	function increment_value() {
		if (!increment) return
		e.value = e.value + increment
		e.input.select(0, -1)
	}
	let increment_timer
	function start_incrementing() {
		increment_value()
		increment_timer = setInterval(increment_value, 100)
	}
	let start_incrementing_timer
	function add_events(button, sign) {
		button.on('mousedown', function() {
			e.input.focus()
			increment = e.step * sign
			increment_value()
			start_incrementing_timer = setTimeout(start_incrementing, 500)
			return false
		})
		button.on('mouseup', function() {
			clearTimeout(start_incrementing_timer)
			clearInterval(increment_timer)
			increment = 0
		})
	}
	add_events(e.up  , 1)
	add_events(e.down, -1)

	// init

	t.value = t.value || 0

})
