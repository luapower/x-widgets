/*
	Listbox widget.
	Written by Cosmin Apreutesei. Public Domain.

	--

*/

listbox = component('x-listbox', function(e) {

	e.class('x-widget')
	e.class('x-listbox')
	e.class('x-focusable')
	e.attrval('tabindex', 0)

	e.page_size = 10

	e.init = function() {

		for (item of e.items) {
			let text = typeof(item) == 'string' ? item : item.text
			let item_div = H.div({class: 'x-listbox-item x-item'}, text)
			e.add(item_div)
			item_div.item = item
			item_div.on('mousedown', item_mousedown)
		}

	}

	// model

	e.late_property('selected_index', function() {
		return e.selected_item ? e.selected_item.index : null
	}, function(i) {
		select_item_by_index(i)
	})

	alias(e, 'value', 'selected_index')

	// controller

	e.attach = function() {
		if (e.selected_item)
			e.selected_item.make_visible()
	}

	e.on('keydown', list_keydown)

	function select_item_by_index(i, pick, from_user_input) {
		let item = null
		if (i != null) {
			i = clamp(i, 0, e.at.length-1)
			item = e.at[i]
		}
		return select_item(item, pick, from_user_input)
	}

	function select_item(item, pick, from_user_input) {
		if (item == e.selected_item)
			return
		if (e.selected_item) {
			e.selected_item.class('focused', false)
			e.selected_item.class('selected', false)
		}
		if (item) {
			item.class('focused')
			item.class('selected')
			item.make_visible()
		}
		e.selected_item = item
		e.fire('selected', item ? item.item : null)
		e.fire('value_changed', item ? item.index : null, from_user_input)
		if (pick)
			e.fire('value_picked', from_user_input) // dropdown protocol
	}

	function item_mousedown() {
		e.focus()
		select_item(this, true, true)
		return false // prevent bubbling up to dropdown.
	}

	function list_keydown(key) {
		let d
		switch (key) {
			case 'ArrowUp'   : d = -1; break
			case 'ArrowDown' : d =  1; break
			case 'ArrowLeft' : d = -1; break
			case 'ArrowRight': d =  1; break
			case 'PageUp'    : d = -e.page_size; break
			case 'PageDown'  : d =  e.page_size; break
			case 'Home'      : d = -1/0; break
			case 'End'       : d =  1/0; break
		}
		if (d) {
			select_item_by_index(e.selected_index + d, false, true)
			return false
		}
		if (key == 'Enter') {
			if (e.selected_item)
				e.fire('value_picked', true) // dropdown protocol
			return false
		}
	}

	// dropdown protocol

	e.property('display_value', function() {
		return e.selected_item ? e.selected_item.innerHTML : ''
	})

	e.pick_value = function(v) {
		select_item_by_index(v, true, false)
	}

	e.pick_near_value = function(delta) {
		select_item_by_index(e.selected_index + delta, true, false)
	}

})
