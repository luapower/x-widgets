/*
	Grid/TreeList Widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

// sign() that only returns only -1 or 1, never 0, and returns -1 for -0.
function strict_sign(x) {
	return 1/x == 1/-0 ? -1 : (x >= 0 ? 1 : -1)
}

grid = component('x-grid', function(e) {

	// geometry
	e.w = 400
	e.h = 400
	e.row_h = 26
	e.row_border_h = 1
	e.min_col_w = 20

	// editing features
	e.can_focus_cells = true
	e.can_edit = true
	e.can_add_rows = true
	e.can_remove_rows = true
	e.can_change_rows = true

	// keyboard behavior
	e.tab_navigation = false    // disabled as it prevents jumping out of the grid.
	e.auto_advance = 'next_row' // advance on enter = false|'next_row'|'next_cell'
	e.auto_advance_row = true   // jump row on horiz. navigation limits
	e.auto_jump_cells = true    // jump to next/prev cell on caret limits
	e.keep_editing = true       // re-enter edit mode after navigating
	e.save_cell_on = 'input'    // save cell on 'input'|'exit_edit'
	e.save_row_on = 'exit_edit' // save row on 'input'|'exit_edit'|'exit_row'|false
	e.prevent_exit_edit = false // prevent exiting edit mode on validation errors
	e.prevent_exit_row = true   // prevent changing row on validation errors

	e.class('x-widget')
	e.class('x-grid')
	e.class('x-focusable')
	e.attrval('tabindex', 0)

	create_view()

	e.init = function() {
		create_fields()
		create_rows()
		update_header_table()
	}

	// model ------------------------------------------------------------------

	// when: cols changed, rowset fields changed.
	function create_fields() {
		e.fields = []
		if (e.cols) {
			for (let fi of e.cols)
				if (e.rowset.fields[fi].visible != false)
					e.fields.push(e.rowset.fields[fi])
		} else {
			for (let field of e.rowset.fields)
				if (field.visible != false)
					e.fields.push(field)
		}
		if (e.dropdown_value_col)
			e.dropdown_value_field = e.rowset.field(e.dropdown_value_col)
		if (e.dropdown_display_col)
			e.dropdown_display_field = e.rowset.field(e.dropdown_display_col)
		else
			e.dropdown_display_field = e.dropdown_value_field
	}

	function field_w(field) {
		return max(e.min_col_w, field.w || 0)
	}

	function create_row(row) {
		return {row: row}
	}

	// NOTE: we load only the first 500K rows because of scrollbox
	// implementation limitations of browser rendering engines:
	// Chrome shows drawing artefacts over ~1.3mil rows at standard row height.
	// Firefox resets the scrollbar over ~700K rows at standard row height.
	// A custom scrollbar implementation is needed for rendering larger rowsets.

	// when: entire rowset changed.
	function create_rows() {
		e.rows = []
		let rows = e.rowset.rows
		for (let i = 0; i < min(5e5, rows.length); i++) {
			let row = rows[i]
			if (!row.removed)
				e.rows.push(create_row(row))
		}
	}

	function row_index(row) {
		for (let i = 0; i < e.rows.length; i++)
			if (e.rows[i].row == row)
				return i
	}

	function row_field_at(cell) {
		let [ri, fi] = cell
		return [ri != null ? e.rows[ri] : null, fi != null ? e.fields[fi] : null]
	}

	function can_change_value(row, field) {
		return e.can_edit && e.can_change_rows
			&& e.rowset.can_change_value(row.row, field)
	}

	function can_focus_cell(row, field) {
		return (field == null || e.can_focus_cells)
			&& e.rowset.can_focus_cell(row.row, field)
	}

	function find_row(field, v) {
		for (let ri = 0; ri < e.rows.length; ri++)
			if (e.rows[ri].row.values[field.index] == v)
				return ri
	}

	// rendering / geometry ---------------------------------------------------

	function scroll_y(sy) {
		return clamp(sy, 0, max(0, e.rows_h - e.rows_view_h))
	}

	function scroll_to_cell(cell) {
		let [ri, fi] = cell
		if (ri == null)
			return
		let view = e.rows_view_div
		let th = fi != null && e.header_tr.at[fi]
		let h = e.row_h
		let y = h * ri
		let x = th ? th.offsetLeft  : 0
		let w = th ? th.clientWidth : 0
		view.scroll_to_view_rect(x, y, w, h)
	}

	function first_visible_row(sy) {
		return floor(sy / e.row_h)
	}

	function rows_y_offset(sy) {
		return floor(sy - sy % e.row_h)
	}

	// when: row count or height changed, rows viewport height changed, header height changed.
	function update_heights() {
		e.rows_h = e.row_h * e.rows.length - floor(e.row_border_h / 2)
		e.rows_view_h = e.clientHeight - e.header_table.clientHeight
		e.rows_div.h = e.rows_h
		e.rows_view_div.h = e.rows_view_h
		e.visible_row_count = floor(e.rows_view_h / e.row_h) + 2
		e.page_rows = floor(e.rows_view_h / e.row_h)
		update_input_geometry()
	}

	function tr_at(ri) {
		let sy = e.scroll_y
		let i0 = first_visible_row(sy)
		let i1 = i0 + e.visible_row_count
		return e.rows_table.at[ri - i0]
	}

	function tr_td_at(cell) {
		let [ri, fi] = cell
		let tr = ri != null && tr_at(ri)
		return [tr, tr && fi != null ? tr.at[fi] : null]
	}

	// rendering --------------------------------------------------------------

	function create_view() {

		e.header_tr = H.tr()
		e.header_table = H.table({class: 'x-grid-header-table'}, e.header_tr)
		e.rows_table = H.table({class: 'x-grid-rows-table'})
		e.rows_div = H.div({class: 'x-grid-rows-div'}, e.rows_table)
		e.rows_view_div = H.div({class: 'x-grid-rows-view-div'}, e.rows_div)
		e.add(e.header_table, e.rows_view_div)

		e.on('mousemove', view_mousemove)
		e.on('focusin'  , view_focusin)
		e.on('blur'     , view_blur)
		e.on('keydown'  , view_keydown)
		e.on('keypress' , view_keypress)

		e.rows_view_div.on('scroll', update_view)
	}

	// when: fields changed.
	function update_header_table() {
		set_header_visibility()
		e.header_table.clear()
		for (let field of e.fields) {

			let sort_icon  = H.div({class: 'fa x-grid-sort-icon'})
			let e1 = H.td({class: 'x-grid-header-title-td'}, field.name)
			let e2 = H.td({class: 'x-grid-header-sort-icon-td'}, sort_icon)
			if (field.align == 'right')
				[e1, e2] = [e2, e1]
			e1.attr('align', 'left')
			e2.attr('align', 'right')
			let title_table =
				H.table({class: 'x-grid-header-th-table'},
					H.tr(0, e1, e2))

			let th = H.th({class: 'x-grid-header-th x-grid-cell'}, title_table)

			th.field = field
			th.sort_icon = sort_icon

			if (field.w) th.w = field_w(field)
			if (field.max_w) th.max_w = field.max_w
			if (field.min_w) th.min_w = max(10, field.min_w)

			th.on('mousedown', header_cell_mousedown)
			th.on('rightmousedown', header_cell_rightmousedown)
			th.on('contextmenu', function() { return false })

			e.header_tr.add(th)
		}
		e.header_table.add(e.header_tr)
	}

	// when: fields changed, rows viewport height changed.
	function update_rows_table() {
		e.rows_table.clear()
		for (let i = 0; i < e.visible_row_count; i++) {
			let tr = H.tr({class: 'x-grid-tr x-item'})
			for (let i = 0; i < e.fields.length; i++) {
				let th = e.header_tr.at[i]
				let field = e.fields[i]
				let td = H.td({class: 'x-grid-td x-grid-cell'})
				td.w = field_w(field)
				td.h = e.row_h
				td.style['border-bottom-width'] = e.row_border_h + 'px'
				if (field.align)
					td.attr('align', field.align)
				td.on('mousedown', cell_mousedown)
				tr.add(td)
			}
			e.rows_table.add(tr)
		}
	}

	// when: widget height changed.
	function resize_view() {
		update_heights()
		update_rows_table()
		update_view()
	}

	// when: scroll_y changed.
	function update_row(tr, ri) {
		let row = e.rows[ri]
		tr.row = row
		tr.row_index = ri
		for (let fi = 0; fi < e.fields.length; fi++) {
			let field = e.fields[fi]
			let td = tr.at[fi]
			td.field = field
			td.field_index = fi
			if (row) {
				td.innerHTML = e.rowset.display_value(row.row, field)
				td.class('x-item', can_focus_cell(row, field))
				td.class('read-only', !can_change_value(row, field))
				td.style.display = null
			} else {
				td.clear()
				td.style.display = 'none'
			}
		}
	}
	function update_rows() {
		let sy = e.scroll_y
		let i0 = first_visible_row(sy)
		e.rows_table.y = rows_y_offset(sy)
		let n = e.visible_row_count
		for (let i = 0; i < n; i++) {
			let tr = e.rows_table.at[i]
			update_row(tr, i0 + i)
		}
	}

	// when: order_by changed.
	function update_sort_icons() {
		for (let th of e.header_tr.children) {
			let dir = e.order_by_dir(th.field)
			let pri = e.order_by_priority(th.field)
			let sort_icon = th.sort_icon
			sort_icon.class('fa-sort'             , false)
			sort_icon.class('fa-angle-up'         , false)
			sort_icon.class('fa-angle-double-up'  , false)
			sort_icon.class('fa-angle-down'       , false)
			sort_icon.class('fa-angle-double-down', false)
			sort_icon.class('fa-angle'+(pri ? '-double' : '')+'-up'  , dir == 'asc')
			sort_icon.class('fa-angle'+(pri ? '-double' : '')+'-down', dir == 'desc')
		}
	}

	function update_focus(set) {
		let [tr, td] = tr_td_at(e.focused_cell)
		if (tr) { tr.class('focused', set); tr.class('editing', e.input && set); }
		if (td) { td.class('focused', set); td.class('editing', e.input && set); }
	}

	// when: heights changed.
	function update_input_geometry() {
		if (!e.input)
			return
		let [ri, fi] = e.focused_cell
		let th = e.header_tr.at[fi]
		let fix = floor(e.row_border_h / 2 + (window.chrome ? .5 : 0))
		e.input.x = th.offsetLeft
		e.input.y = e.row_h * ri + fix
		e.input.w = th.clientWidth
		e.input.h = e.row_h - e.row_border_h
		e.input.style['padding-bottom'] = fix + 'px'
	}

	// when: col resizing.
	function update_col_width(td_index, w) {
		for (let tr of e.rows_table.children) {
			let td = tr.at[td_index]
			td.w = w
		}
	}

	// when: horizontal scrolling, widget width changed.
	function update_header_x(sx) {
		e.header_table.x = -sx
	}

	function set_header_visibility() {
		if (e.header_visible != false && !e.hasclass('picker'))
			e.header_table.show()
		else
			e.header_table.hide()
	}

	function update_view() {
		let sy = e.rows_view_div.scrollTop
		let sx = e.rows_view_div.scrollLeft
		update_focus(false)
		sy = scroll_y(sy)
		e.scroll_y = sy
		update_rows()
		update_focus(true)
		update_header_x(sx)
	}

	function create_input() {
		let [row, field] = row_field_at(e.focused_cell)
		let [_, td] = tr_td_at(e.focused_cell)
		e.input = H.input({
			type: 'text',
			class: 'x-grid-input x-grid-cell',
			maxlength: field.maxlength,
			value: e.rowset.value(row.row, field),
		})
		e.input.on('input', input_input)
		e.input.on('focus', input_focus)
		e.input.on('blur', input_blur)
		e.rows_div.add(e.input)
		update_input_geometry()
		e.input.style.textAlign = field.align
		if (td)
			td.innerHTML = null
	}

	function free_input() {
		let input = e.input
		let [row, field] = row_field_at(e.focused_cell)
		let [tr, td] = tr_td_at(e.focused_cell)
		e.input = null
		e.rows_div.removeChild(input)
		if (td)
			td.innerHTML = e.rowset.display_value(row.row, field)
	}

	function reload() {
		e.focused_cell = [null, null]
		create_rows()
		update_heights()
		update_view()
		e.focus_cell()
	}

	function hook_unhook_events(on) {
		document.onoff('mousedown', document_mousedown, on)
		document.onoff('mouseup'  , document_mouseup  , on)
		document.onoff('mousemove', document_mousemove, on)
		e.rowset.onoff('reload'       , reload       , on)
		e.rowset.onoff('value_changed', value_changed, on)
		e.rowset.onoff('row_added'    , row_added    , on)
		e.rowset.onoff('row_removed'  , row_removed  , on)
	}

	function copy_keys(dst, src, keys) {
		for (k in keys)
			dst[k] = src[k]
	}

	let picker_forced_options = {can_edit: 1, can_focus_cells: 1}

	function set_picker_options() {
		e._saved = {}
		copy_keys(e._saved, e, picker_forced_options)
		let as_picker = e.hasclass('picker')
		e.can_edit        = !as_picker
		e.can_focus_cells = !as_picker
	}

	function unset_picker_options() {
		copy_keys(e, e._saved, picker_forced_options)
		e._saved = null
	}

	e.attach = function(parent) {
		set_header_visibility()
		set_picker_options()
		update_heights()
		update_rows_table()
		update_view()
		hook_unhook_events(true)
		e.focus_cell()
	}

	e.detach = function() {
		hook_unhook_events(false)
		unset_picker_options()
	}

	// make columns resizeable ------------------------------------------------

	let hit_th, hit_x

	function document_mousedown() {
		if (window.grid_col_resizing || !hit_th)
			return
		e.focus()
		window.grid_col_resizing = true
		e.class('col-resizing')
		return false
	}

	function document_mouseup() {
		window.grid_col_resizing = false
		e.class('col-resizing', false)
	}

	function view_mousemove(mx, my) {
		if (window.grid_col_resizing)
			return
		// hit-test for column resizing.
		hit_th = null
		if (mx <= e.rows_view_div.offsetLeft + e.rows_view_div.clientWidth) {
			// ^^ not over vertical scrollbar.
			for (let th of e.header_tr.children) {
				hit_x = mx - (e.header_table.offsetLeft + th.offsetLeft + th.offsetWidth)
				if (hit_x >= -5 && hit_x <= 5) {
					hit_th = th
					break
				}
			}
		}
		e.class('col-resize', hit_th != null)
	}

	function document_mousemove(mx, my) {
		if (!e.hasclass('col-resizing'))
			return
		let field = e.fields[hit_th.index]
		let w = mx - (e.header_table.offsetLeft + hit_th.offsetLeft + hit_x)
		let min_w = max(e.min_col_w, field.min_w || 0)
		let max_w = max(min_w, field.max_w || 1000)
		hit_th.w = clamp(w, min_w, max_w)
		update_col_width(hit_th.index, hit_th.clientWidth)
		update_input_geometry()
		return false
	}

	// focusing ---------------------------------------------------------------

	function view_focusin() {
		e.class('focused')
	}

	function view_blur() {
		e.class('focused', false)
	}

	function input_focus() {
		print('input_focus')
		//view_focus()
	}

	function input_blur() {
		print('input_blur')
		//e.exit_edit()
		//view_blur()
	}

	e.focused_cell = [null, null]

	e.first_focusable_cell = function(cell, rows, cols, options) {

		if (cell == null) cell = e.focused_cell // null cell means focused cell.
		if (rows == null) rows = 0 // by default find the first focusable row.
		if (cols == null) cols = 0 // by default find the first focusable col.

		let for_editing = options && options.for_editing // skip non-editable cells.
		let must_move = options && options.must_move // return only if moved.
		let must_not_move_row = options && options.must_not_move_row // return only if row not moved.
		let must_not_move_col = options && options.must_not_move_col // return only if col not moved.

		let [ri, fi] = cell
		let ri_inc = strict_sign(rows)
		let fi_inc = strict_sign(cols)
		rows = abs(rows)
		cols = abs(cols)
		let move_row = rows >= 1
		let move_col = cols >= 1
		let start_ri = ri
		let start_fi = fi

		// the default cell is the first or the last depending on direction.
		if (ri == null) ri = ri_inc * -1/0
		if (fi == null) fi = fi_inc * -1/0

		// clamp out-of-bound row/col indices.
		ri = clamp(ri, 0, e.rows.length-1)
		fi = clamp(fi, 0, e.fields.length-1)

		let last_valid_ri = null
		let last_valid_fi = null
		let last_valid_row

		// find the last valid row, stopping after the specified row count.
		while (ri >= 0 && ri < e.rows.length) {
			let row = e.rows[ri]
			if (can_focus_cell(row, null, for_editing)) {
				last_valid_ri = ri
				last_valid_row = row
				if (rows <= 0)
					break
			}
			rows--
			ri += ri_inc
		}
		if (last_valid_ri == null)
			return [null, null]

		// if wanted to move the row but couldn't, don't move the col either.
		let row_moved = last_valid_ri != start_ri
		if (move_row && !row_moved)
			cols = 0

		while (fi >= 0 && fi < e.fields.length) {
			let field = e.fields[fi]
			if (can_focus_cell(last_valid_row, field, for_editing)) {
				last_valid_fi = fi
				if (cols <= 0)
					break
			}
			cols--
			fi += fi_inc
		}

		let col_moved = last_valid_fi != start_fi

		if (must_move && !(row_moved || col_moved))
			return [null, null]

		if ((must_not_move_row && row_moved) || (must_not_move_col && col_moved))
			return [null, null]

		return [last_valid_ri, last_valid_fi]
	}

	e.focus_cell = function(cell, rows, cols, options) {

		if (cell == false) { // false means remove focus only.
			cell = [null, null]
		} else {
			cell = e.first_focusable_cell(cell, rows, cols, options)
			if (cell[0] == null) // failure to find cell means cancel.
				return false
		}

		if (e.focused_cell[0] != cell[0]) {
			if (!e.exit_row())
				return false
		} else if (e.focused_cell[1] != cell[1]) {
			if (!e.exit_edit())
				return false
		} else
			return true // same cell.

		update_focus(false)
		e.focused_cell = cell
		update_focus(true)
		if (!options || options.make_visible != false)
			scroll_to_cell(cell)

		if (e.dropdown_value_field) {
			let [row] = row_field_at(cell)
			let v
			if (row)
				v = e.rowset.value(row.row, e.dropdown_value_field)
			e.fire('value_changed', v, true)
		}

		return true
	}

	e.focus_next_cell = function(cols, auto_advance_row) {
		let dir = strict_sign(cols)
		return e.focus_cell(null, dir * 0, cols, {must_move: true})
			|| ((auto_advance_row || e.auto_advance_row)
				&& e.focus_cell(null, dir, dir * -1/0))
	}

	function on_last_row() {
		let [ri] = e.first_focusable_cell(null, 1, 0, {must_move: true})
		return ri == null
	}

	function focused_row() {
		let [ri] = e.focused_cell
		return ri != null ? e.rows[ri] : null
	}

	// editing ----------------------------------------------------------------

	e.input = null

	/*

	function set_invalid_row(tr, invalid) {
		tr.class('invalid', invalid)
	}

	function set_modified_cell(td, modified) {
		set_invalid_cell(td, false)
		td.class('modified', modified)
		if (modified)
			set_modified_row(td.parent, true)
		else if (no_cell_has_class(td.parent, 'modified'))
			set_modified_row(td.parent, false)
	}

	function set_modified_row(tr, modified) {
		set_invalid_row(tr, false)
		tr.class('modified', modified)
	}
	*/

	// NOTE: input even is not cancellable.
	function input_input(e) {
		let td = e.focused_td
		let tr = e.focused_tr
		td.class('unsaved', true)
		td.class('modified', true)
		tr.class('modified', true)
		td.class('invalid', false)
		tr.class('invalid', false)
		tr.class('invalid_values', false)
		e.tooltip(td, false)
		e.tooltip(tr, false)
		if (e.save_cell_on == 'input')
			if (!e.save_cell(e.focused_td))
				return
		if (e.save_row_on == 'input')
			if (!e.save_row(e.focused_tr))
				return
	}

	function td_input(td) {
		return td.first
	}

	e.enter_edit = function(where) {
		if (e.input)
			return
		let [row, field] = row_field_at(e.focused_cell)
		if (!can_change_value(row, field))
			return
		create_input()
		if (where == 'right')
			e.input.select(e.input.value.length, e.input.value.length)
		else if (where == 'left')
			e.input.select(0, 0)
		else if (where)
			e.input.select(0, e.input.value.length)
		if (where)
			e.input.focus()
	}

	e.exit_edit = function() {
		if (!e.input)
			return true
		/*
		let [tr, td] = tr_td_at(e.focused_cell)
		if (e.save_cell_on == 'exit_edit')
			e.save_cell(td)
		if (e.save_row_on == 'exit_edit')
			e.save_row(tr)
		if (e.prevent_exit_edit)
			if (e.focused_td.hasclass('invalid'))
				return false
		*/
		free_input()
		return true
	}

	e.exit_row = function() {
		/*
		let tr = e.focused_tr
		if (!tr)
			return true
		let td = e.focused_td
		if (e.save_row_on == 'exit_row')
			e.save_row(tr)
		if (e.prevent_exit_row)
			if (tr.hasclass('invalid_values') || tr.hasclass('invalid'))
				return false
		*/
		if (!e.exit_edit())
			return false
		return true
	}

	// saving -----------------------------------------------------------------

	function cell_data(cell) {
		let [ri, fi] = cell
		let row = e.rows[ri]
		let t = row.metadata[fi]
		if (!t) {
			t = {}
			row.metadata[fi] = t
		}
		return t
	}

	function no_child_has_class(e, classname) {
		for (let c of e.children)
			if (c.hasclass(classname))
				return false
		return true
	}

	e.tooltip = function(e, msg) {
		// let div = H.div({class: 'grid-error'}, msg)
		e.title = msg || ''
	}

	e.save_cell = function(cell) {
		let t = cell_data(cell)
		if (!t.unsaved)
			return !t.invalid
		let [row, field] = row_field_at(cell)
		let ret = e.rowset.set_value(row, field, e.input.value, g)
		let ok = ret === true
		t.unsaved = false
		t.invalid = !ok
		td.class('unsaved', t.unsaved)
		td.class('invalid', t.invalid)
		tr.class('invalid_values', !no_child_has_class(tr, 'invalid'))
		if (ok)
			tr.class('unsaved', true)
		e.tooltip(td, !ok && ret)
		return ok
	}

	e.save_row = function(cell) {
		let t = cell_data(cell)
		if (!t.unsaved)
			return !t.invalid
		for (td of tr.children)
			if (!e.save_cell(td))
				return false
		let ret = e.rowset.save_row(tr.row)
		let ok = ret === true
		tr.class('unsaved', false)
		tr.class('saving', ok)
		tr.class('invalid', !ok)
		e.tooltip(tr, !ok && ret)
		return ok
	}

	e.revert_cell = function(td) {
		let row = td.parent.row
		let field = e.fields[td.index]
		let input = td_input(td)
		input.value = e.rowset.value(row, field)
	}

	// adding & removing rows -------------------------------------------------

	let adding

	e.insert_row = function() {
		if (!e.can_edit || !e.can_add_rows)
			return false
		adding = false
		let row = e.rowset.add_row(e)
		return row != null
	}

	e.add_row = function() {
		if (!e.can_edit || !e.can_add_rows)
			return false
		adding = true
		let row = e.rowset.add_row(e)
		return row != null
	}

	e.remove_row = function(ri) {
		if (!e.can_edit || !e.can_remove_rows) return false
		let row = e.rows[ri]
		return e.rowset.remove_row(row.row, e)
	}

	e.remove_focused_row = function() {
		let [ri, fi] = e.focused_cell
		if (ri == null)
			return false
		if (!e.remove_row(ri))
			return false
		if (!e.focus_cell([ri, fi]))
			e.focus_cell([ri, fi], -0)
		return true
	}

	// updating from rowset changes ------------------------------------------

	function value_changed(row, field, val, source) {
		let ri = row_index(row)
		if (ri == null)
			return
	}

	function row_added(row, source) {
		row = create_row(row)
		update_focus(false)
		if (source == e) {
			let reenter_edit = e.input && e.keep_editing
			let [ri] = e.focused_cell
			if (adding) {
				ri = e.rows.length
				e.focused_cell[0] = ri // move focus to added row index.
			}
			e.rows.insert(ri, row)
			update_heights()
			update_view()
			scroll_to_cell(e.focused_cell)
			if (reenter_edit)
				e.enter_edit(true)
		} else {
			e.rows.push(row)
			update_heights()
			sort()
		}
	}

	function row_removed(row, source) {
		let ri = row_index(row)
		if (ri == null)
			return
		if (e.focused_cell[0] == ri) {
			// removing the focused row: unfocus it.
			e.focus_cell(false)
		} else if (e.focused_cell[0] > ri) {
			// adjust focused row index to account for the removed row.
			update_focus(false)
			e.focused_cell[0]--
		}
		e.rows.remove(ri)
		update_heights()
		update_view()
	}

	// mouse bindings ---------------------------------------------------------

	function header_cell_mousedown(ev) {
		if (e.hasclass('col-resize'))
			return
		e.toggle_order(this.field, ev.shiftKey)
		return false
	}

	function header_cell_rightmousedown() {
		if (e.hasclass('col-resize'))
			return
		e.clear_order()
		return false
	}

	function cell_mousedown() {
		if (e.hasclass('col-resize'))
			return
		e.focus()
		let ri = this.parent.row_index
		let fi = this.field_index
		if (e.focused_cell[0] == ri && e.focused_cell[1] == fi) {
			e.enter_edit()
		} else {
			e.focus_cell([ri, fi], 0, 0, {must_not_move_row: true})
			e.fire('value_picked', true) // dropdown protocol.
		}
		return false // prevent bubbling up to dropdown.
	}

	// keyboard bindings ------------------------------------------------------

	function view_keydown(key, shift) {

		// Arrows: horizontal navigation.
		if (key == 'ArrowLeft' || key == 'ArrowRight') {

			let cols = key == 'ArrowLeft' ? -1 : 1

			let reenter_edit = e.input && e.keep_editing

			let move = !e.input
				|| (e.auto_jump_cells && !shift
					&& e.input.caret == (cols < 0 ? 0 : e.input.value.length))

			if (move && e.focus_next_cell(cols)) {
				if (reenter_edit)
					e.enter_edit(cols > 0 ? 'left' : 'right')
				return false
			}
		}

		// Tab/Shift+Tab cell navigation.
		if (key == 'Tab' && e.tab_navigation) {

			let cols = shift ? -1 : 1

			let reenter_edit = e.input && e.keep_editing

			if (e.focus_next_cell(cols, true))
				if (reenter_edit)
					e.enter_edit(cols > 0 ? 'left' : 'right')

			return false
		}

		// insert with the arrow down key on the last focusable row.
		if (key == 'ArrowDown') {
			if (on_last_row())
				if (e.add_row())
					return false
		}

		// remove last row with the arrow up key if not edited.
		if (key == 'ArrowUp') {
			if (on_last_row()) {
				let row = focused_row()
				if (row && row.row.is_new && !row.modified) {
					e.remove_focused_row()
					return false
				}
			}
		}

		// vertical navigation.
		if (  key == 'ArrowDown' || key == 'ArrowUp'
			|| key == 'PageDown'  || key == 'PageUp'
			|| key == 'Home'      || key == 'End'
		) {
			let rows
			switch (key) {
				case 'ArrowUp'   : rows = -1; break
				case 'ArrowDown' : rows =  1; break
				case 'PageUp'    : rows = -e.page_rows; break
				case 'PageDown'  : rows =  e.page_rows; break
				case 'Home'      : rows = -1/0; break
				case 'End'       : rows =  1/0; break
			}

			let reenter_edit = e.input && e.keep_editing

			if (e.focus_cell(null, rows)) {
				if (reenter_edit)
					e.enter_edit(true)
				return false
			}
		}

		// F2: enter edit mode
		if (!e.input && key == 'F2') {
			e.enter_edit(true)
			return false
		}

		// Enter: toggle edit mode, and navigate on exit
		if (key == 'Enter') {
			if (e.hasclass('picker')) {
				e.fire('value_picked', true)
			} else if (!e.input) {
				e.enter_edit(true)
			} else if (e.exit_edit()) {
				if (e.auto_advance == 'next_row') {
					if (e.focus_cell(null, 1))
						if (e.keep_editing)
							e.enter_edit(true)
				} else if (e.auto_advance == 'next_cell')
					if (e.focus_next_cell(shift ? -1 : 1))
						if (e.keep_editing)
							e.enter_edit(true)
			}
			return false
		}

		// Esc: revert cell edits or row edits.
		if (key == 'Escape') {
			if (e.hasclass('picker'))
				return
			e.exit_edit()
			e.focus()
			return false
		}

		// insert key: insert row
		if (key == 'Insert') {
			e.insert_row()
			return false
		}

		// delete key: delete active row
		if (!e.input && key == 'Delete') {
			if (e.remove_focused_row())
				return false
		}

	}

	// printable characters: enter quick edit mode
	function view_keypress() {
		if (!e.input) {
			e.enter_edit(true)
			return false
		}
	}

	// sorting ----------------------------------------------------------------

	let order_by_dir = new Map()

	e.late_property('order_by',
		function() {
			let a = []
			for (let [field, dir] of order_by_dir) {
				a.push(field.name + (dir == 'asc' ? '' : ' desc'))
			}
			return a.join(', ')
		},
		function(s) {
			order_by_dir = new Map()
			let ea = s.split(/\s*,\s*/)
			for (let e of ea) {
				let m = e.match(/^([^\s]*)\s*(.*)$/)
				let name = m[1]
				let field = e.rowset.field(name)
				if (field) {
					let dir = m[2] || 'asc'
					if (dir == 'asc' || dir == 'desc')
						order_by_dir.set(field, dir)
				}
			}
		}
	)

	e.order_by_priority = function(field) {
		let i = order_by_dir.size-1
		for (let [field1] of order_by_dir) {
			if (field1 == field)
				return i
			i--
		}
	}

	e.order_by_dir = function(field) {
		return order_by_dir.get(field)
	}

	e.toggle_order = function(field, keep_others) {
		let dir = order_by_dir.get(field)
		dir = dir == 'asc' ? 'desc' : 'asc'
		if (!keep_others)
			order_by_dir.clear()
		order_by_dir.set(field, dir)
		sort()
	}

	e.clear_order = function() {
		order_by_dir.clear()
		sort()
	}

	function sort() {

		if (!order_by_dir)
			return
		if (!order_by_dir.size) {
			update_sort_icons()
			update_view()
			return
		}

		let [focused_row] = row_field_at(e.focused_cell)
		update_focus(false)

		let s = []
		let cmps = []
		for (let [field, dir] of order_by_dir) {
			let i = field.index
			cmps[i] = e.rowset.comparator(field)
			let r = dir == 'asc' ? 1 : -1
			// header row comes first
			s.push('if (!r1.row) return -1')
			s.push('if (!r2.row) return  1')
			// invalid values come first
			s.push('var v1 = !(r1.fields && r1.fields['+i+'].invalid)')
			s.push('var v2 = !(r2.fields && r2.fields['+i+'].invalid)')
			s.push('if (v1 < v2) return -1')
			s.push('if (v1 > v2) return  1')
			// modified values come second
			s.push('var v1 = !(r1.fields && r1.fields['+i+'].modified)')
			s.push('var v2 = !(r2.fields && r2.fields['+i+'].modified)')
			s.push('if (v1 < v2) return -1')
			s.push('if (v1 > v2) return  1')
			// compare values using the rowset comparator
			s.push('var cmp = cmps['+i+']')
			s.push('var r = cmp(r1.row, r2.row, '+i+')')
			s.push('if (r) return r * '+r)
		}
		s.push('return 0')
		s = 'let f = function(r1, r2) {\n\t' + s.join('\n\t') + '\n}; f'
		let cmp = eval(s)
		e.rows.sort(cmp)

		if (focused_row)
			e.focused_cell[0] = row_index(focused_row.row)

		update_sort_icons()
		update_view()
		update_focus(true)
		update_input_geometry()
		scroll_to_cell(e.focused_cell)

	}

	// dropdown protocol

	e.property('display_value', function() {
		let [row] = row_field_at(e.focused_cell)
		return row ? e.rowset.display_value(row.row, e.dropdown_display_field) : ''
	})

	e.pick_value = function(v, from_user_input) {
		let field = e.dropdown_value_field
		let ri = find_row(field, v)
		if (ri == null)
			return // TODO: deselect
		if (e.focus_cell([ri, field.index]))
			e.fire('value_picked', from_user_input) // dropdown protocol.
	}

	e.pick_near_value = function(delta, from_user_input) {
		let field = e.dropdown_value_field
		if (e.focus_cell(e.focused_cell, delta))
			e.fire('value_picked', from_user_input)
	}

})

