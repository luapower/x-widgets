/*
	Listbox Widget.
	Written by Cosmin Apreutesei. Public Domain.

	--

*/

listbox = component('x-listbox', function(e) {

	e.class('x-widget')
	e.class('x-listbox')
	e.attrval('tabindex', 0)

	e.page_size = 10

	e.init = function() {

		for (item of e.items) {
			let text = typeof(item) == 'string' ? item : item.text
			let item_div = H.div({class: 'x-listbox-item'}, text)
			e.add(item_div)
			item_div.item = item
			item_div.on('mousedown', item_mousedown)
		}

	}

	// model

	e.late_property('selected_index', function() {
		return e.selected_item ? e.selected_item.index : -1
	}, function(i) {
		select_item_by_index(i)
	})

	alias(e, 'value', 'selected_index')

	// controller

	e.on('keydown', list_keydown)

	function select_item_by_index(i, pick) {
		i = clamp(i, 0, e.at.length-1)
		let item = e.at[i]
		if (!item)
			return
		return select_item(item, pick)
	}

	function select_item(item_div, pick) {
		if (e.selected_item)
			e.selected_item.class('selected', false)
		item_div.class('selected')
		e.selected_item = item_div
		e.fire('selected', item_div.item)
		e.fire('value_changed', e.selected_item.index)
		if (pick)
			e.fire('value_picked') // dropdown protocol
	}

	function item_mousedown() {
		select_item(this, true)
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
			e.selected_index += d
			return false
		}

		if (key == 'Enter') {
			if (e.selected_item)
				e.fire('value_picked') // dropdown protocol
			return false
		}
	}

	// dropdown protocol

	e.property('display_value', function() {
		return e.selected_item ? e.selected_item.innerHTML : ''
	})

	e.pick_value = function(v) {
		select_item_by_index(v, true)
	}

	e.pick_near_value = function(delta) {
		select_item_by_index(e.selected_index + delta, true)
	}

})
