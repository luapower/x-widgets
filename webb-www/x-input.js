/*
	Input and spin-input widgets.
	Written by Cosmin Apreutesei. Public Domain.

*/

input = component('x-input', function(e) {

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

	function set_valid(err) {
		e.invalid = err != true
		e.input.class('x-input-invalid', e.invalid)
		e.error = e.invalid && err || ''
		e.tooltip.at[0].innerHTML = e.error
		e.tooltip.style.display = e.error ? null : 'none'
	}

	let value, value_set

	e.init = function() {
		if ('default_value' in e) {
			value = e.default_value
			value_set = true
		}
	}

	function get_value() {
		return value
	}

	function set_value(v, from_user_input) {
		if (value_set && v === value) // event loop barrier
			return true
		let err = e.validate(v)
		if (err != true) // invalid value spread barrier
			return err
		set_valid(true)
		e.input.value = e.to_text(v)
		value = v
		value_set = true
		e.fire('value_changed', v, from_user_input) // input protocol
		return true
	}

	e.late_property('value', get_value, set_value)

	// view

	function input_input() {
		let v = e.from_text(e.input.value)
		set_valid(set_value(v, true))
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

})

// spin_input ----------------------------------------------------------------

spin_input = component('x-spin-input', input, function(e) {

	e.class('x-spin-input')

	// model

	e.step =  1
	e.min  = -1/0
	e.max  =  1/0

	// view

	e.up   = H.div({class: 'x-spin-input-button fa'})
	e.down = H.div({class: 'x-spin-input-button fa'})

	e.attr_property('button-style'    , 'plus-minus')
	e.attr_property('button-placement', 'auto')

	let init = e.init
	e.init = function() {

		init.call(this)

		let bs = e.button_style
		let bp = e.button_placement; bp = bp != 'auto' && bp

		if (bs == 'plus-minus') {
			e.up  .class('fa-plus')
			e.down.class('fa-minus')
			bp = bp || 'each-side'
		} else if (bs == 'up-down') {
			e.up  .class('fa-caret-up')
			e.down.class('fa-caret-down')
			bp = bp || 'left'
		} else if (bs == 'left-right') {
			e.up  .class('fa-caret-right')
			e.down.class('fa-caret-left')
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

	}

	// controller

	e.input.input_filter = function(v) {
		return /^[\-]?\d*\.?\d*$/.test(v) // allow digits and '.' only
	}

	e.min_error  = function() { return 'Value must be at least {0}'.format(e.min) }
	e.max_error  = function() { return 'Value must be at most {0}'.format(e.max) }
	e.step_error = function() {
		if (e.step == null) return true
		if (e.step == 1) return 'Value must be an integer'
		return 'Value must be multiple of {0}'.format(e.step)
	}

	e.validate = function(v) {
		if (v < e.min) return e.min_error(v)
		if (v > e.max) return e.max_error(v)
		if (v % e.step != 0) return e.step_error(v)
		return true
	}

	e.from_text = function(s) {
		return s !== '' ? Number(s) : null
	}

	e.to_text = function(x) {
		return x != null ? String(x) : ''
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

})
