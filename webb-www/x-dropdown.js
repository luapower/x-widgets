/*
	Dropdown widget.
	Written by Cosmin Apreutesei. Public Domain.

	--

*/

dropdown = component('x-dropdown', function(e) {

	// view

	e.class('x-input')
	e.class('x-dropdown')

	e.attrval('tabindex', 0)

	// view

	e.value_div = H.span({class: 'x-dropdown-value'})
	e.button = H.span({class: 'x-dropdown-button fa fa-caret-down'})
	e.add(e.value_div, e.button)

	function update_view() {
		if (!e.isConnected)
			return
		let v = e.picker.display_value
		if (v === '')
			v = '&nbsp;'
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

	// model

	e.late_property('value', function() {
		return e.picker.value
	}, function(v) {
		e.picker.pick_value(v)
	})

	// controller

	e.on('mousedown', view_mousedown)
	e.on('keydown'  , view_keydown)
	e.on('wheel'    , view_wheel)
	e.on('focusout' , view_focusout)

	e.init = function() {
		e.picker.on('value_changed', value_changed)
		e.picker.on('value_picked' , value_picked)
	}

	// focusing

	let builtin_focus = e.focus
	let focusing_picker
	e.focus = function() {
		if (e.isopen) {
			focusing_picker = true // barrier works because .focus() is synchronous.
			e.picker.focus()
			focusing_picker = false
		} else
			builtin_focus.call(this)
	}

	// isopen property

	e.late_property('isopen',
		function() {
			return e.hasclass('open')
		},
		function(open) {
			if (e.isopen == open)
				return
			e.class('open', open)
			e.button.replace_class('fa-caret-down', 'fa-caret-up', open)
			e.picker.class('picker', open)
			if (open) {
				e.cancel_value = e.value
				e.picker.y = e.clientHeight
				e.picker.x = -e.clientLeft
				e.add(e.picker)
			} else {
				e.cancel_value = null
				e.picker.remove()
			}
		}
	)

	e.open   = function() { e.isopen = true }
	e.close  = function() { e.isopen = false }
	e.toggle = function() { e.isopen = !e.isopen }
	e.cancel = function() {
		if (!e.isopen) return
		e.value = e.cancel_value
	}

	// picker protocol

	function value_changed(v) {
		update_view()
	}

	function value_picked(from_user_input) {
		e.close()
		if (from_user_input)
			e.focus()
		e.fire('value_changed', e.picker.value) // input protocol
		if (e.rowset) {
			let err = e.rowset.set_value(e.value)
			// TODO: show error
		}
	}

	// kb & mouse binding

	function view_mousedown(ev) {
		if (!e.picker.contains(ev.target)) {
			e.toggle()
			e.focus()
			return false
		}
	}

	function view_keydown(key) {
		if (key == 'Enter') {
			e.toggle()
			e.focus()
			return false
		}
		if (key == 'Escape') {
			if (e.isopen) {
				e.cancel()
				e.focus()
				return false
			}
		}
		if (key == 'ArrowDown' || key == 'ArrowUp') {
			if (!e.isopen) {
				e.picker.pick_near_value(key == 'ArrowDown' ? 1 : -1)
				return false
			}
		}
	}

	function view_wheel(dy) {
		if (!e.isopen) {
			e.picker.pick_near_value(dy / 100)
			return false
		}
	}

	// auto-closing when clicking or tabbing outside the dropdown.

	function view_focusout(ev) {
		if (focusing_picker)
			return
		if (!e.isopen)
			return
		if (!ev.relatedTarget) // might've been focusing inside
			return
		if (e.contains(ev.relatedTarget)) // focusing inside
			if (ev.relatedTarget != e)
				return
		e.cancel()
	}

	function document_mousedown(ev) {
		if (!e.contains(ev.target))
			e.cancel()
	}

})
