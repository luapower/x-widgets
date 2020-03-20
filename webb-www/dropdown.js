/*
	Dropdown Widget.
	Written by Cosmin Apreutesei. Public Domain.

	--

*/

dropdown = component('x-dropdown', function(e, t) {

	function init() {
		create_view()
	}

	// model

	function get_value() {
		return e.picker.value
	}

	function set_value(v) {
		e.picker.pick_value(v)
	}

	property(e, 'value', {get: get_value, set: set_value})

	// view

	function create_view() {
		e.picker = t.picker
		e.class('x-input')
		e.class('x-dropdown')
		e.attr('tabindex', 0)
		e.value_div = H.span({class: 'x-dropdown-value'})
		e.button = H.span({class: 'x-dropdown-button fa fa-caret-down'})
		e.add(e.value_div, e.button)
		e.picker.on('value_changed', value_changed)
		e.picker.on('value_picked', value_picked)
		e.on('mousedown', view_mousedown)
		e.on('keydown', view_keydown)
		e.on('wheel', view_wheel)
	}

	function update_view() {
		if (!e.isConnected)
			return
		let v = e.picker.display_value
		if (typeof(v) == 'string')
			e.value_div.innerHTML = v
		else
			e.value_div.replace(0, v)
	}

	e.attach = function(parent) {
		update_view()
		document.on('mousedown', document_mousedown)
	}

	e.detach = function() {
		document.off('mousedown', document_mousedown)
	}

	// picker protocol

	function value_changed(v) {
		update_view()
	}

	function value_picked() {
		e.close_picker()
		if (e.rowset) {
			let err = e.rowset.set_value(e.value)
			// TODO: show error
		}
	}

	// controller

	e.open_picker = function() {
		if (e.open) return
		e.class('open', true)
		e.button.replace_class('fa-caret-down', 'fa-caret-up')
		e.old_value = e.value
		e.picker.class('x-dropdown-picker', true)
		e.picker.y = e.clientHeight
		e.picker.x = -e.clientLeft
		e.add(e.picker)
		e.picker.focus()
	}

	e.close_picker = function() {
		if (!e.open) return
		e.class('open', false)
		e.button.replace_class('fa-caret-down', 'fa-caret-up', false)
		e.old_value = undefined
		e.picker.remove()
		e.focus()
	}

	function get_open() {
		return e.hasclass('open')
	}

	function set_open(v) {
		if (v)
			e.open_picker()
		else
			e.close_picker()
	}

	property(e, 'open', {get: get_open, set: set_open})

	e.toggle_picker = function() {
		e.open = !e.open
	}

	// kb & mouse binding

	function view_mousedown(ev) {
		if (!e.picker.contains(ev.target)) {
			e.toggle_picker()
			ev.preventDefault() // prevent focusing back this element.
		}
	}

	function view_keydown(key) {
		if (key == 'Enter') {
			e.toggle_picker()
			return false
		}
		if (key == 'Escape') {
			e.value = e.old_value
			return false
		}
		if (key == 'ArrowDown' || key == 'ArrowUp') {
			if (!e.open) {
				e.picker.pick_near_value(key == 'ArrowDown' ? 1 : -1)
				return false
			}
		}
	}

	function view_wheel(dy) {
		if (!e.open) {
			e.picker.pick_near_value(dy / 100)
			return false
		}
	}

	function document_mousedown(ev) {
		if (!e.contains(ev.target))
			e.close_picker()
	}

	init()

})
