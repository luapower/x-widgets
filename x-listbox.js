
// ---------------------------------------------------------------------------
// listbox
// ---------------------------------------------------------------------------

listbox = component('x-listbox', function(e) {

	rowset_widget(e)

	e.class('x-widget')
	e.class('x-listbox')
	e.class('x-focusable')
	e.attrval('tabindex', 0)
	e.attrval('flow', 'vertical')
	e.attr_property('flow')

	e.init = function() {

		if(e.items) {
			assert(!e.rowset)
			create_rowset_for_items()
			update_rowset_from_items()
		} else {
			if (e.value_col)
				e.value_field = e.rowset.field(e.value_col)
			if (e.display_col)
				e.display_field = e.rowset.field(e.display_col)
			else
				e.display_field = e.value_field
		}

		e.init_vfields()
		e.init_vrows()
		e.init_nav()
	}

	e.attach = function() {
		e.init_rows()
		e.init_value()
		e.bind_rowset(true)
		e.bind_nav(true)
	}

	e.detach = function() {
		e.bind_rowset(false)
		e.bind_nav(false)
	}

	// rowset_view mixin.

	e.update_row = function(item, row) { // stub
		if (e.display_field)
			item.html = e.rowset.display_value(row, e.display_field)
	}

	e.init_rows = function() {
		selected_row_index = null
		found_row_index = null
		e.clear()
		for (row of e.rowset.rows) {
			let item = H.div({class: 'x-listbox-item x-item'})
			e.update_row(item, row)
			e.add(item)
			item.row = row
			item.on('mousedown', item_mousedown)
		}
	}

	e.update_cell_value = function(ri, fi) {
		let item = e.at[ri]
		e.update_row(item, e.vrows[ri].row)
	}

	e.update_cell_error = function(ri, fi, err) {
		let item = e.at[ri]
		item.class('invalid', err != null)
	}

	let selected_row_index
	e.update_cell_focus = function(ri, fi) {
		let item1 = e.at[ri]
		let item0 = e.at[selected_row_index]
		if (item0) {
			item0.class('focused', false)
			item0.class('selected', false)
		}
		if (item1) {
			item1.class('focused')
			item1.class('selected')
			item1.make_visible()
		}
		selected_row_index = ri
	}

	// item-based rowset.

	function create_rowset_for_items() {
		e.rowset = rowset({
			fields: [{format: e.format_item}],
			rows: [],
		})
		e.display_field = e.rowset.field(0)
	}

	function update_rowset_from_items() {
		e.rowset.rows = []
		for (let item of e.items)
			e.rowset.rows.push({values: [item]})
	}

	e.format_item = function(item) {
		return typeof(item) == 'string' ? item : item.text
	}

	e.property('focused_item', function() {
		return e.focused_row ? e.focused_row.values[0] : null
	})

	function select_item(item, pick, focus_dropdown) {
		if (e.value_field)
			e.value = e.rowset.value(item.row, e.value_field)
		else
			e.value = item.index
		if (pick)
			e.fire('value_picked', focus_dropdown) // picker protocol
	}

	function select_item_by_index(i, pick, focus_dropdown) {
		e.focused_row_index = i
		if (pick)
			e.fire('value_picked', focus_dropdown) // picker protocol
	}

	function item_mousedown() {
		e.focus()
		select_item(this, true, true)
		return false
	}

	// find the next item before/after the selected item that would need
	// scrolling, if the selected item would be on top/bottom of the viewport.
	function page_item(forward) {
		if (!e.focused_row)
			return forward ? e.first : e.last
		let item = e.at[e.focused_row_index]
		let sy0 = item.offsetTop + (forward ? 0 : item.offsetHeight - e.clientHeight)
		item = forward ? item.next : item.prev
		while(item) {
			let [sx, sy] = item.make_visible_scroll_offset(0, sy0)
			if (sy != sy0)
				return item
			item = forward ? item.next : item.prev
		}
		return forward ? e.last : e.first
	}

	function rel_row_index(d) {
		let i = e.focused_row_index
		return i != null ? i + d : strict_sign(d) * -1/0
	}

	e.on('keydown', function(key) {
		let d
		switch (key) {
			case 'ArrowUp'   : d = -1; break
			case 'ArrowDown' : d =  1; break
			case 'ArrowLeft' : d = -1; break
			case 'ArrowRight': d =  1; break
			case 'Home'      : d = -1/0; break
			case 'End'       : d =  1/0; break
		}
		if (d) {
			let i = rel_row_index(d)
			select_item_by_index(i, false, true)
			return false
		}
		if (key == 'PageUp' || key == 'PageDown') {
			select_item(page_item(key == 'PageDown'), false, true)
			return false
		}
		if (key == 'Enter') {
			if (e.focused_row)
				e.fire('value_picked', true) // picker protocol
			return false
		}
	})

	// crude quick-search only for the first letter.
	let found_row_index
	function find_item(c, again) {
		if (!e.display_field)
			return
		if (e.focused_row_index != found_row_index)
			found_row_index = null // user changed selection, start over.
		let ri = found_row_index != null ? found_row_index+1 : 0
		if (ri >= e.rowset.rows.length)
			ri = null
		while (ri != null) {
			let s = e.rowset.display_value(e.rowset.rows[ri], e.display_field)
			if (s.starts(c.toLowerCase()) || s.starts(c.toUpperCase())) {
				select_item_by_index(ri, false, true)
				break
			}
			ri++
			if (ri >= e.rowset.rows.length)
				ri = null
		}
		found_row_index = ri
		if (found_row_index == null && !again)
			find_item(c, true)
	}
	e.on('keypress', function(c) {
		find_item(c)
	})

	// picker protocol

	e.pick_near_value = function(delta) {
		select_item_by_index(rel_row_index(delta), true)
	}

	e.pick_next_value_starting_with = function(s) {
		find_item(s)
	}

})

