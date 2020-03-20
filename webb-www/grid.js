/*
	Grid/TreeList Widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

// box scroll-to-view box. from box2d.lua.
function scroll_to_view_rect(x, y, w, h, pw, ph, sx, sy) {
	let min_sx = -x
	let min_sy = -y
	let max_sx = -(x + w - pw)
	let max_sy = -(y + h - ph)
	return [
		min(max(sx, min_sx), max_sx),
		min(max(sy, min_sy), max_sy)
	]
}

// sign() that only returns only -1 or 1, never 0, and returns -1 for -0.
function strict_sign(x) {
	return 1/x == 1/-0 ? -1 : (x >= 0 ? 1 : -1)
}

grid = component('x-grid', function(g, ...options) {

	let defaults = {
		// geometry
		w: 500,
		h: 400,
		row_h: 24,
		row_border_h: 0,
		// keyboard behavior
		auto_advance: 'next_row', // advance on enter: false|'next_row'|'next_cell'
		auto_advance_row: true,   // jump row on horiz. navigation limits
		auto_jump_cells: true,    // jump to next/prev cell on caret limits
		keep_editing: true,       // re-enter edit mode after navigating
		save_cell_on: 'input',    // save cell on 'input'|'exit_edit'
		save_row_on: 'exit_edit', // save row on 'input'|'exit_edit'|'exit_row'|false
		prevent_exit_edit: false, // prevent exiting edit mode on validation errors
		prevent_exit_row: true,   // prevent changing row on validation errors
	}

	let d
	let fields, dropdown_field

	function init() {
		update(g, defaults, ...options)
		d = g.rowset
		init_fields()
		init_order_by()
		create_view()
	}

	// model ------------------------------------------------------------------

	function init_fields() {
		fields = []
		if (g.cols) {
			for (let fi of g.cols)
				if (!d.fields[fi].hidden)
					fields.push(d.fields[fi])
		} else {
			for (let field of d.fields)
				if (!field.hidden)
					fields.push(field)
		}
		if (g.dropdown_field)
			dropdown_field = d.field(g.dropdown_field)
	}

	function create_row(row) {
		return {row: row}
	}

	function create_rows() {
		g.rows = []
		for (let i = 0; i < d.rows.length; i++)
			if (!d.rows[i].removed)
				g.rows.push(create_row(d.rows[i]))
	}

	function row_index(row) {
		for (let i = 0; i < g.rows.length; i++)
			if (g.rows[i].row == row)
				return i
	}

	function row_field_at(cell) {
		let [ri, fi] = cell
		return [ri != null ? g.rows[ri] : null, fi != null ? fields[fi] : null]
	}

	// rendering / geometry ---------------------------------------------------

	function scroll_y(sy) {
		return clamp(sy, 0, max(0, g.rows_h - g.rows_view_h))
	}

	function scroll_to_cell(cell) {
		let [ri, fi] = cell
		if (ri == null)
			return
		let view = g.rows_view_div
		let th = fi != null && g.header_tr.at[fi]

		let h = g.row_h
		let y = h * ri
		let x = th ? th.offsetLeft  : 0
		let w = th ? th.clientWidth : 0

		let pw = view.clientWidth
		let ph = view.clientHeight

		let sx0 = view.scrollLeft
		let sy0 = view.scrollTop

		let [sx, sy] = scroll_to_view_rect(x, y, w, h, pw, ph, -sx0, -sy0)

		view.scroll(-sx, -sy)
	}

	function first_visible_row(sy) {
		return floor(sy / g.row_h)
	}

	function rows_y_offset(sy) {
		return floor(sy - sy % g.row_h)
	}

	function update_heights() {
		g.rows_h = g.row_h * g.rows.length - floor(g.row_border_h / 2)
		g.rows_view_h = g.h - g.header_table.clientHeight
		g.rows_div.h = g.rows_h
		g.rows_view_div.h = g.rows_view_h
		g.visible_row_count = floor(g.rows_view_h / g.row_h) + 2
		g.page_rows = floor(g.rows_view_h / g.row_h)
		update_input_geometry()
	}

	function tr_at(ri) {
		let sy = g.scroll_y
		let i0 = first_visible_row(sy)
		let i1 = i0 + g.visible_row_count
		return g.rows_table.at[ri - i0]
	}

	function tr_td_at(cell) {
		let [ri, fi] = cell
		let tr = ri != null && tr_at(ri)
		return [tr, tr && fi != null ? tr.at[fi] : null]
	}

	// rendering --------------------------------------------------------------

	function create_view() {

		g.header_tr = H.tr()
		g.header_table = H.table({class: 'grid-header-table'}, g.header_tr)
		g.rows_table = H.table({class: 'grid-rows-table'})
		g.rows_div = H.div({class: 'grid-rows-div'}, g.rows_table)
		g.rows_view_div = H.div({class: 'grid-rows-view-div'}, g.rows_div)
		g.view = H.div({class: 'grid-div', tabindex: '0'},
			g.header_table,
			g.rows_view_div)
		g.view.on('mousemove', view_mousemove)
		g.view.on('focusin', view_focusin)
		g.view.on('blur', view_blur)

		for (let field of fields) {

			let sort_icon  = H.div({class: 'fa grid-sort-icon'})
			let e1 = H.td({class: 'grid-header-title-td'}, field.name)
			let e2 = H.td({class: 'grid-header-sort-icon-td'}, sort_icon)
			if (field.align == 'right')
				[e1, e2] = [e2, e1]
			e1.attr('align', 'left')
			e2.attr('align', 'right')
			let title_table =
				H.table({class: 'grid-header-th-table'},
					H.tr(0, e1, e2))

			let th = H.th({class: 'grid-header-th grid-cell'}, title_table)

			th.field = field
			th.sort_icon = sort_icon

			if (field.w) th.w = field.w
			if (field.max_w) th.max_w = field.max_w
			if (field.min_w) th.min_w = max(10, field.min_w)

			th.on('mousedown', header_cell_mousedown)
			th.on('contextmenu', function(e) { e.preventDefault() })

			g.header_tr.add(th)
		}
		g.header_table.add(g.header_tr)

		if (g.parent)
			g.parent.add(g.view)

		g.view.w = g.w

		// --------------------------------------------------------------------

		update_heights()

		for (let i = 0; i < g.visible_row_count; i++) {

			let tr = H.tr({class: 'grid-tr'})

			for (let i = 0; i < fields.length; i++) {
				let th = g.header_tr.at[i]
				let field = fields[i]
				let td = H.td({class: 'grid-td grid-cell'})
				td.w = th.clientWidth
				td.h = g.row_h
				td.style['border-bottom-width'] = g.row_border_h + 'px'
				td.on('mousedown', cell_mousedown)
				tr.add(td)
			}

			g.rows_table.add(tr)
		}

		g.rows_view_div.on('scroll', update_view)

		sort()
	}

	function update_row(tr, ri) {
		let row = g.rows[ri]
		tr.row = row
		tr.row_index = ri
		for (let fi = 0; fi < fields.length; fi++) {
			let field = fields[fi]
			let td = tr.at[fi]
			td.field = field
			td.field_index = fi
			if (row) {
				td.innerHTML = d.display_value(row.row, field)
				td.class('read-only', !d.can_change_value(row.row, field))
				td.class('not-focusable', !d.can_be_focused(row.row, field))
				td.style.display = null
			} else {
				td.innerHTML = ''
				td.style.display = 'none'
			}
		}
	}

	function update_rows() {
		let sy = g.scroll_y
		let i0 = first_visible_row(sy)
		g.rows_table.y = rows_y_offset(sy)
		let n = g.visible_row_count
		for (let i = 0; i < n; i++) {
			let tr = g.rows_table.at[i]
			update_row(tr, i0 + i)
		}
	}

	function update_sort_icons() {
		for (let th of g.header_tr.children) {
			let dir = g.order_by_dir(th.field)
			let sort_icon = th.sort_icon
			sort_icon.class('fa-sort', false)
			sort_icon.class('fa-angle-up', false)
			sort_icon.class('fa-angle-down', false)
			sort_icon.class(
				   dir == 'asc'  && 'fa-angle-up'
				|| dir == 'desc' && 'fa-angle-down'
			   || 'fa-sort', true)
		}
	}

	function update_focus(set) {
		let [tr, td] = tr_td_at(g.focused_cell)
		if (tr) { tr.class('focused', set); tr.class('editing', g.input && set); }
		if (td) { td.class('focused', set); td.class('editing', g.input && set); }
	}

	function update_input_geometry() {
		if (!g.input)
			return
		let [ri, fi] = g.focused_cell
		let th = g.header_tr.at[fi]
		g.input.x = th.offsetLeft
		g.input.y = g.row_h * ri
		g.input.w = th.clientWidth
		g.input.h = g.row_h
	}

	function update_col_width(td_index, w) {
		for (let tr of g.rows_table.children) {
			let td = tr.at[td_index]
			td.w = w
		}
	}

	function update_header_x(sx) {
		g.header_table.x = -sx
	}

	function update_view() {
		let sy = g.rows_view_div.scrollTop
		let sx = g.rows_view_div.scrollLeft
		update_focus(false)
		sy = scroll_y(sy)
		g.scroll_y = sy
		update_rows()
		update_focus(true)
		update_header_x(sx)
	}

	function create_input() {
		let [row, field] = row_field_at(g.focused_cell)
		let [_, td] = tr_td_at(g.focused_cell)
		g.input = H.input({
			type: 'text',
			class: 'grid-input grid-cell',
			maxlength: field.maxlength,
			value: d.value(row.row, field),
		})
		g.input.on('input', input_input)
		g.input.on('focus', input_focus)
		g.input.on('blur', input_blur)
		g.rows_div.add(g.input)
		update_input_geometry()
		g.input.style.textAlign = field.align
		if (td)
			td.innerHTML = null
	}

	function free_input() {
		let input = g.input
		let [row, field] = row_field_at(g.focused_cell)
		let [tr, td] = tr_td_at(g.focused_cell)
		g.input = null
		g.rows_div.removeChild(input)
		if (td)
			td.innerHTML = d.display_value(row.row, field)
	}

	function reload() {
		g.focused_cell = [null, null]
		create_rows()
		create_view()
		g.focus_cell()
	}

	function hook_unhook_events(on) {
		document.onoff('keydown'  , keydown  , on)
		document.onoff('keypress' , keypress , on)
		document.onoff('mousedown', mousedown, on)
		document.onoff('mouseup'  , mouseup  , on)
		document.onoff('mousemove', mousemove, on)
		d.onoff('reload'       , reload       , on)
		d.onoff('value_changed', value_changed, on)
		d.onoff('row_added'    , row_added    , on)
		d.onoff('row_removed'  , row_removed  , on)
	}

	g.attach = function(parent) {
		hook_unhook_events(true)
		reload()
	}

	g.detach = function() {
		hook_unhook_events(false)
	}

	// make columns resizeable ------------------------------------------------

	let hit_th, hit_x

	function mousedown(e) {
		if (window.grid_col_resizing || !hit_th)
			return
		focus()
		window.grid_col_resizing = true
		g.view.class('col-resizing', true)
		e.preventDefault()
	}

	function mouseup(e) {
		window.grid_col_resizing = false
		g.view.class('col-resizing', false)
	}

	function view_mousemove(e) {
		if (window.grid_col_resizing)
			return
		hit_th = null
		for (th of g.header_tr.children) {
			hit_x = e.clientX - (g.header_table.offsetLeft + th.offsetLeft + th.offsetWidth)
			if (hit_x >= -5 && hit_x <= 5) {
				hit_th = th
				break
			}
		}
		g.view.class('col-resize', hit_th != null)
	}

	function mousemove(e) {
		if (!g.view.hasclass('col-resizing'))
			return
		let field = fields[hit_th.index]
		let w = e.clientX - (g.header_table.offsetLeft + hit_th.offsetLeft + hit_x)
		let min_w = max(20, field.min_w || 0)
		let max_w = max(min_w, field.max_w || 1000)
		hit_th.w = clamp(w, min_w, max_w)
		update_col_width(hit_th.index, hit_th.clientWidth)
		update_input_geometry()
		e.preventDefault()
	}

	// focusing ---------------------------------------------------------------

	function is_focused() {
		let e = document.activeElement
		return e == g.view || e == g.input
	}

	function view_focusin() {
		g.view.class('focused', true)
	}

	function view_blur() {
		g.view.class('focused', false)
	}

	function input_focus() {
		print('input_focus')
		//view_focus()
	}

	function input_blur() {
		print('input_blur')
		//g.exit_edit()
		//view_blur()
	}

	g.focused_cell = [null, null]

	g.first_focusable_cell = function(cell, rows, cols, options) {

		if (cell == null) cell = g.focused_cell // null cell means focused cell.
		if (rows == null) rows = 0 // by default find the first focusable row.
		if (cols == null) cols = 0 // by default find the first focusable col.

		let for_editing = options && options.for_editing // skip non-editable cells.
		let must_move = options && options.must_move // return only if moved.
		let must_not_move = options && options.must_not_move // return only if not moved.

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
		ri = clamp(ri, 0, g.rows.length-1)
		fi = clamp(fi, 0, fields.length-1)

		let last_valid_ri = null
		let last_valid_fi = null
		let last_valid_row

		// find the last valid row, stopping after the specified row count.
		while (ri >= 0 && ri < g.rows.length) {
			let row = g.rows[ri].row
			if (d.can_be_focused(row, for_editing)) {
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

		while (fi >= 0 && fi < fields.length) {
			let field = fields[fi]
			if (d.can_be_focused(last_valid_row, field, for_editing)) {
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

		if (must_not_move && (row_moved || col_moved))
			return [null, null]

		return [last_valid_ri, last_valid_fi]
	}

	g.focus_cell = function(cell, rows, cols, options) {

		if (cell == false) { // false means remove focus only.
			cell = [null, null]
		} else {
			cell = g.first_focusable_cell(cell, rows, cols, options)
			if (cell[0] == null) // failure to find cell means cancel.
				return false
		}

		if (g.focused_cell[0] != cell[0]) {
			if (!g.exit_row())
				return false
		} else if (g.focused_cell[1] != cell[1]) {
			if (!g.exit_edit())
				return false
		} else
			return true // same cell.

		update_focus(false)
		g.focused_cell = cell
		update_focus(true)
		if (!options || options.make_visible != false)
			scroll_to_cell(cell)

		return true
	}

	g.focus_next_cell = function(cols, auto_advance_row) {
		let dir = strict_sign(cols)
		return g.focus_cell(null, dir * 0, cols, {must_move: true})
			|| ((auto_advance_row || g.auto_advance_row)
				&& g.focus_cell(null, dir, dir * -1/0))
	}

	function on_last_row() {
		let [ri] = g.first_focusable_cell(null, 1, 0, {must_move: true})
		return ri == null
	}

	function focused_row() {
		let [ri] = g.focused_cell
		return ri != null ? g.rows[ri] : null
	}

	// editing ----------------------------------------------------------------

	g.input = null

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
		let td = g.focused_td
		let tr = g.focused_tr
		td.class('unsaved', true)
		td.class('modified', true)
		tr.class('modified', true)
		td.class('invalid', false)
		tr.class('invalid', false)
		tr.class('invalid_values', false)
		g.tooltip(td, false)
		g.tooltip(tr, false)
		if (g.save_cell_on == 'input')
			if (!g.save_cell(g.focused_td))
				return
		if (g.save_row_on == 'input')
			if (!g.save_row(g.focused_tr))
				return
	}

	function td_input(td) {
		return td.first
	}

	g.enter_edit = function(where) {
		if (g.input)
			return
		create_input()
		if (where == 'right')
			g.input.select(g.input.value.length, g.input.value.length)
		else if (where == 'left')
			g.input.select(0, 0)
		else if (where)
			g.input.select(0, g.input.value.length)
		if (where)
			g.input.focus()
	}

	g.exit_edit = function() {
		if (!g.input)
			return true
		/*
		let [tr, td] = tr_td_at(g.focused_cell)
		if (g.save_cell_on == 'exit_edit')
			g.save_cell(td)
		if (g.save_row_on == 'exit_edit')
			g.save_row(tr)
		if (g.prevent_exit_edit)
			if (g.focused_td.hasclass('invalid'))
				return false
		*/
		free_input()
		return true
	}

	g.exit_row = function() {
		/*
		let tr = g.focused_tr
		if (!tr)
			return true
		let td = g.focused_td
		if (g.save_row_on == 'exit_row')
			g.save_row(tr)
		if (g.prevent_exit_row)
			if (tr.hasclass('invalid_values') || tr.hasclass('invalid'))
				return false
		*/
		if (!g.exit_edit())
			return false
		return true
	}

	// saving -----------------------------------------------------------------

	function cell_data(cell) {
		let [ri, fi] = cell
		let row = g.rows[ri]
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

	g.tooltip = function(e, msg) {
		// let div = H.div({class: 'grid-error'}, msg)
		e.title = msg || ''
	}

	g.save_cell = function(cell) {
		let t = cell_data(cell)
		if (!t.unsaved)
			return !t.invalid
		let [row, field] = row_field_at(cell)
		let ret = d.set_value(row, field, g.input.value, g)
		let ok = ret === true
		t.unsaved = false
		t.invalid = !ok
		td.class('unsaved', t.unsaved)
		td.class('invalid', t.invalid)
		tr.class('invalid_values', !no_child_has_class(tr, 'invalid'))
		if (ok)
			tr.class('unsaved', true)
		g.tooltip(td, !ok && ret)
		return ok
	}

	g.save_row = function(cell) {
		let t = cell_data(cell)
		if (!t.unsaved)
			return !t.invalid
		for (td of tr.children)
			if (!g.save_cell(td))
				return false
		let ret = d.save_row(tr.row)
		let ok = ret === true
		tr.class('unsaved', false)
		tr.class('saving', ok)
		tr.class('invalid', !ok)
		g.tooltip(tr, !ok && ret)
		return ok
	}

	g.revert_cell = function(td) {
		let row = td.parent.row
		let field = fields[td.index]
		let input = td_input(td)
		input.value = d.value(row, field)
	}

	// adding & removing rows -------------------------------------------------

	let adding

	g.insert_row = function() {
		adding = false
		let row = d.add_row(g)
		return row != null
	}

	g.add_row = function() {
		adding = true
		let row = d.add_row(g)
		return row != null
	}

	g.remove_row = function(ri) {
		let row = g.rows[ri]
		return d.remove_row(row.row, g)
	}

	g.remove_focused_row = function() {
		let [ri, fi] = g.focused_cell
		if (ri == null)
			return false
		if (!g.remove_row(ri))
			return false
		if (!g.focus_cell([ri, fi]))
			g.focus_cell([ri, fi], -0)
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
		if (source == g) {
			let reenter_edit = g.input && g.keep_editing
			let [ri] = g.focused_cell
			if (adding) {
				ri = g.rows.length
				g.focused_cell[0] = ri // move focus to added row index.
			}
			g.rows.insert(ri, row)
			update_heights()
			update_view()
			scroll_to_cell(g.focused_cell)
			if (reenter_edit)
				g.enter_edit(true)
		} else {
			g.rows.push(row)
			update_heights()
			sort()
		}
	}

	function row_removed(row, source) {
		let ri = row_index(row)
		if (ri == null)
			return
		if (g.focused_cell[0] == ri) {
			// removing the focused row: unfocus it.
			g.focus_cell(false)
		} else if (g.focused_cell[0] > ri) {
			// adjust focused row index to account for the removed row.
			update_focus(false)
			g.focused_cell[0]--
		}
		g.rows.remove(ri)
		update_heights()
		update_view()
	}

	// mouse boundings --------------------------------------------------------

	function header_cell_mousedown(e) {
		if (g.view.hasclass('col-resize'))
			return
		if (e.which == 3)  // right-click
			g.clear_order()
		else
			g.toggle_order(this.field, e.shiftKey)
		e.preventDefault()
	}

	function cell_mousedown(e) {
		if (g.view.hasclass('col-resize'))
			return
		let ri = this.parent.row_index
		let fi = this.field_index
		if (g.focused_cell[0] == ri && g.focused_cell[1] == fi) {
			g.enter_edit()
		} else
			g.focus_cell([ri, fi], 0, 0, {must_not_move: true})
	}

	// key bindings -----------------------------------------------------------

	function keydown_key(key, shift) {

		// Arrows: horizontal navigation.
		if (key == 'ArrowLeft' || key == 'ArrowRight') {

			let cols = key == 'ArrowLeft' ? -1 : 1

			let reenter_edit = g.input && g.keep_editing

			let move = !g.input
				|| (g.auto_jump_cells && !shift
					&& g.input.caret == (cols < 0 ? 0 : g.input.value.length))

			if (move && g.focus_next_cell(cols)) {
				if (reenter_edit)
					g.enter_edit(cols > 0 ? 'left' : 'right')
				return
			}
		}

		// Tab/Shift+Tab cell navigation.
		if (key == 'Tab') {

			let cols = shift ? -1 : 1

			let reenter_edit = g.input && g.keep_editing

			if (g.focus_next_cell(cols, true))
				if (reenter_edit)
					g.enter_edit(cols > 0 ? 'left' : 'right')

			return
		}

		// insert with the arrow down key on the last focusable row.
		if (key == 'ArrowDown') {
			if (on_last_row())
				if (g.add_row())
					return
		}

		// remove last row with the arrow up key if not edited.
		if (key == 'ArrowUp') {
			if (on_last_row()) {
				let row = focused_row()
				if (row && row.row.is_new && !row.modified) {
					g.remove_focused_row()
					return
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
				case 'PageUp'    : rows = -g.page_rows; break
				case 'PageDown'  : rows =  g.page_rows; break
				case 'Home'      : rows = -1/0; break
				case 'End'       : rows =  1/0; break
			}

			let reenter_edit = g.input && g.keep_editing

			if (g.focus_cell(null, rows)) {
				if (reenter_edit)
					g.enter_edit(true)
				return
			}
		}

		// F2: enter edit mode
		if (!g.input && key == 'F2') {
			g.enter_edit(true)
			return
		}

		// Enter: toggle edit mode, and navigate on exit
		if (key == 'Enter') {
			if (!g.input) {
				g.enter_edit(true)
			} else if (g.exit_edit()) {
				if (g.auto_advance == 'next_row') {
					if (g.focus_cell(null, 1))
						if (g.keep_editing)
							g.enter_edit(true)
				} else if (g.auto_advance == 'next_cell')
					if (g.focus_next_cell(shift ? -1 : 1))
						if (g.keep_editing)
							g.enter_edit(true)
			}
			return
		}

		// Esc: revert cell edits or row edits.
		if (key == 'Escape') {
			g.exit_edit()
			return
		}

		// insert key: insert row
		if (key == 'Insert') {
			g.insert_row()
			return
		}

		// delete key: delete active row
		if (!g.input && key == 'Delete') {
			if (g.remove_focused_row())
				return
		}

		return true
	}

	function keydown(e) {
		if (is_focused())
			if (!keydown_key(e.key, e.shiftKey))
				e.preventDefault()
	}

	// printable characters: enter quick edit mode
	function keypress(e) {
		if (!g.input)
			g.enter_edit(true)
	}

	// sorting ----------------------------------------------------------------

	let order_by_dir

	function init_order_by() {
		let order_by = g.order_by || ''
		delete g.order_by
		property(g, 'order_by', {
			get: function() {
				let a = []
				for (let [field, dir] of order_by_dir) {
					a.push(field.name + (dir == 'asc' ? '' : ' desc'))
				}
				return a.join(', ')
			},
			set: function(s) {
				order_by_dir = new Map()
				let ea = s.split(/\s*,\s*/)
				for (let e of ea) {
					let m = e.match(/^([^\s]*)\s*(.*)$/)
					let name = m[1]
					let field = d.field(name)
					if (field) {
						let dir = m[2] || 'asc'
						if (dir == 'asc' || dir == 'desc')
							order_by_dir.set(field, dir)
					}
				}
			}
		})
		g.order_by = order_by || ''
	}

	g.order_by_dir = function(field) {
		return order_by_dir.get(field)
	}

	g.toggle_order = function(field, keep_others) {
		let dir = order_by_dir.get(field)
		dir = dir == 'asc' ? 'desc' : 'asc'
		if (!keep_others)
			order_by_dir.clear()
		order_by_dir.set(field, dir)
		sort()
	}

	g.clear_order = function() {
		order_by_dir.clear()
		sort()
	}

	function sort() {

		if (!order_by_dir.size) {
			update_sort_icons()
			update_view()
			return
		}

		let [focused_row] = row_field_at(g.focused_cell)
		update_focus(false)

		let s = []
		let cmps = []
		for (let [field, dir] of order_by_dir) {
			let i = field.index
			cmps[i] = d.comparator(field)
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
		g.rows.sort(cmp)

		if (focused_row)
			g.focused_cell[0] = row_index(focused_row.row)

		update_sort_icons()
		update_view()
		update_focus(true)
		update_input_geometry()
		scroll_to_cell(g.focused_cell)

	}

	// dropdown protocol

	property(g, 'display_value', {get: function() {
		let [row] = row_field_at(g.focused_cell)
		return row ? d.display_value(row.row, dropdown_field) : ''
	}})

	init()

})

