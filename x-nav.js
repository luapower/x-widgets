
// ---------------------------------------------------------------------------
// nav widget mixin
// ---------------------------------------------------------------------------

/*
	nav widgets must implement:
		update(opt)
		update_cell_state(ri, fi, prop, val, ev)
		update_row_state(ri, prop, val, ev)
		update_cell_editing(ri, [fi], editing)
		scroll_to_cell(ri, [fi])

	fields: [{attr->val}, ...]

	identification:
		name           : field name (defaults to field's numeric index)
		type           : for choosing a field template.

	rendering:
		text           : field name for display purposes (auto-generated default).
		visible        : field can be visible in a grid (true).

	navigation:
		focusable      : field can be focused (true).

	editing:
		client_default : default value that new rows are initialized with.
		server_default : default value that the server sets.
		editable       : allow modifying (true).
		editor         : f() -> editor instance
		from_text      : f(s) -> v
		to_text        : f(v) -> s
		enum_values    : [v1, ...]

	validation:
		allow_null     : allow null (true).
		validate       : f(v, field) -> undefined|err_string
		min            : min value (0).
		max            : max value (inf).
		maxlen         : max text length (256).
		multiple_of    : number that the value must be multiple of (1).
		max_digits     : max number of digits allowed.
		max_decimals   : max number of decimals allowed.

	formatting:
		align          : 'left'|'right'|'center'
		format         : f(v, row) -> s
		date_format    : toLocaleString format options for the date type
		true_text      : display value for boolean true
		false_text     : display value for boolean false
		null_text      : display value for null
		empty_text     : display value for ''

	vlookup:
		lookup_rowset  : rowset to look up values of this field into
		lookup_col     : field in lookup_rowset that matches this field
		display_col    : field in lookup_rowset to use as display_val of this field.
		lookup_failed_display_val : f(v) -> s; what to use when lookup fails.

	sorting:
		sortable       : allow sorting (true).
		compare_types  : f(v1, v2) -> -1|0|1  (for sorting)
		compare_values : f(v1, v2) -> -1|0|1  (for sorting)

	grouping:
		group_by(col) -> group_rowset

	rows: [row1,...]
		row[i]             : current cell value (always valid).
		row.focusable      : row can be focused (true).
		row.editable       : allow modifying (true).
		row.input_val[i]   : currently set cell value, whether valid or not.
		row.error[i]       : error message if cell is invalid.
		row.row_error      : error message if row is invalid.
		row.modified[i]    : value was modified, change not on server yet.
		row.old_value[i]   : initial value before modifying.
		row.is_new         : new row, not added on server yet.
		row.cells_modified : one or more row cells were modified.
		row.removed        : removed row, not removed on server yet.

	field_types : {type -> {attr->val}}

	nav.name_col   : default `display_col` of navs that lookup into this nav.

*/

{
	let upper = function(s) {
		return s.toUpperCase()
	}
	let upper2 = function(s) {
		return ' ' + s.slice(1).toUpperCase()
	}
	function auto_display_name(s) {
		return (s || '').replace(/[\w]/, upper).replace(/(_[\w])/g, upper2)
	}
}

function nav_widget(e) {

	val_widget(e, true)

	e.is_nav = true // for resolver

	e.prop('can_edit'                , {store: 'var', type: 'bool', default: true, hint: 'can change anything at all'})
	e.prop('can_add_rows'            , {store: 'var', type: 'bool', default: true})
	e.prop('can_remove_rows'         , {store: 'var', type: 'bool', default: true})
	e.prop('can_change_rows'         , {store: 'var', type: 'bool', default: true})
	e.prop('can_sort_rows'           , {store: 'var', type: 'bool', default: true})
	e.prop('can_focus_cells'         , {store: 'var', type: 'bool', default: true , hint: 'can focus individual cells vs entire rows'})
	e.prop('can_select_multiple'     , {store: 'var', type: 'bool', default: true})
	e.prop('can_select_non_siblings' , {store: 'var', type: 'bool', default: true})
	e.prop('auto_focus_first_cell'   , {store: 'var', type: 'bool', default: true , hint: 'focus first cell automatically on loading'})
	e.prop('auto_edit_first_cell'    , {store: 'var', type: 'bool', default: false, hint: 'automatically enter edit mode on loading'})
	e.prop('stay_in_edit_mode'       , {store: 'var', type: 'bool', default: true , hint: 're-enter edit mode after navigating'})
	e.prop('auto_advance_row'        , {store: 'var', type: 'bool', default: true , hint: 'jump row on horiz. navigation limits'})
	e.prop('save_row_on'             , {store: 'var', type: 'enum', default: 'exit_edit', enum_values: ['input', 'exit_edit', 'exit_row', 'manual']})
	e.prop('insert_row_on'           , {store: 'var', type: 'enum', default: 'exit_edit', enum_values: ['input', 'exit_edit', 'exit_row', 'manual']})
	e.prop('remove_row_on'           , {store: 'var', type: 'enum', default: 'input'    , enum_values: ['input', 'exit_row', 'manual']})
	e.prop('can_exit_edit_on_errors' , {store: 'var', type: 'bool', default: true , hint: 'allow exiting edit mode on validation errors'})
	e.prop('can_exit_row_on_errors'  , {store: 'var', type: 'bool', default: false, hint: 'allow changing row on validation errors'})
	e.prop('exit_edit_on_lost_focus' , {store: 'var', type: 'bool', default: false, hint: 'exit edit mode when losing focus'})

	// init -------------------------------------------------------------------

	function init_all(res) {
		init_all_fields(res)
		init_all_rows(res)
	}

	e.on('attach', function() {
		init_all(e)
		bind_lookup_rowsets(true)
		bind_param_nav(true)
		e.load()
	})

	function force_unfocus_focused_cell() {
		assert(e.focus_cell(false, false, 0, 0, {force_exit_edit: true}))
	}

	e.on('detach', function() {
		abort_ajax_requests()
		force_unfocus_focused_cell()
		bind_lookup_rowsets(false)
		bind_param_nav(false)
		init_all({})
	})

	// fields array matching 1:1 to row contents ------------------------------

	e.field = function(name) {
		return e.all_fields[name] || name
	}

	function init_tree_field(def) {
		e.tree_field = or(e.all_fields[or(e.tree_col, e.name_col)], or(def.tree_col, def.name_col))
	}

	function init_all_fields(def) {

		e.all_fields = [] // fields in row value order.
		e.pk_fields = [] // primary key fields.

		// not creating fields and rows unless attached because we don't get
		// events while not attached so the nav might get stale.
		if (e.attached) {

			if (def.fields)
				for (let i = 0; i < def.fields.length; i++) {
					let f = def.fields[i]

					// disambiguate field name.
					let name = (f.name || 'f'+i).replace(' ', '_')
					if (name in e.all_fields) {
						let suffix = 2
						while (name+suffix in e.all_fields)
							suffix++
						name += suffix
					}

					let custom_attrs = e.col_attrs && e.col_attrs[name]
					let type = f.type || (custom_attrs && custom_attrs.type)
					let type_attrs = type && (e.field_types[type] || field_types[type])
					let field = update({}, all_field_types, e.all_field_types, type_attrs, f, custom_attrs)

					field.val_index = i
					field.nav = e
					field.w = clamp(field.w, field.min_w, field.max_w)
					if (field.text == null)
						field.text = auto_display_name(field.name)

					e.all_fields[i] = field
					e.all_fields[name] = field
				}

			let pk = def.pk
			if (e.attached && pk) {
				if (typeof pk == 'string')
					pk = pk.split(/\s+/)
				for (let col of pk) {
					let field = e.all_fields[col]
					e.pk_fields.push(field)
					field.is_pk = true
				}
			}

		}

		e.id_field     = e.pk_fields.length == 1 && e.pk_fields[0]
		e.parent_field = e.id_field && e.all_fields[def.parent_col]
		init_tree_field(def)

		e.val_field   = e.all_fields[e.val_col]
		e.index_field = e.all_fields[def.index_col]

		init_fields()
	}

	e.set_val_col = function(v) {
		e.val_field = e.all_fields[v]
		refocus_state('val')()
	}
	e.prop('val_col', {store: 'var'})

	e.set_tree_col = function() {
		init_tree_field(e)
		init_fields()
		e.update({vals: true})
	}
	e.prop('tree_col', {store: 'var'})

	e.set_name_col = function(v) {
		e.name_field = e.all_fields[v]
		if (!e.tree_col)
			e.set_tree_col()
	}
	e.prop('name_col', {store: 'var'})

	// all_fields subset in custom order --------------------------------------

	function init_fields() {
		e.fields = []
		for (let col of cols_array()) {
			let field = e.all_fields[col]
			if (field && field.visible != false)
				e.fields.push(field)
		}
		update_field_index()
		update_field_sort_order()
	}

	e.field_index = function(field) {
		return field && field.index
	}

	function update_field_index() {
		for (let i = 0; i < e.fields.length; i++)
			e.fields[i].index = i
	}

	// visible cols list ------------------------------------------------------

	e.set_cols = function() {
		init_fields()
		e.update({fields: true})
	}
	e.prop('cols', {store: 'var'})

	let all_cols = () => e.all_fields.map((f) => f.name)

	let cols_array = () => e.cols ? e.cols.split(/\s+/) : all_cols()

	function cols_from_array(cols) {
		cols = cols.join(' ')
		return cols == all_cols() ? null : cols
	}

	e.show_field = function(field, on, at_fi) {
		let cols = cols_array()
		if (on)
			if (at_fi != null)
				cols.insert(at_fi, field.name)
			else
				cols.push(field)
		else
			cols.remove_value(field.name)
		e.cols = cols_from_array(cols)
	}

	e.move_field = function(fi, over_fi) {
		if (fi == over_fi)
			return
		let insert_fi = over_fi - (over_fi > fi ? 1 : 0)
		let cols = cols_array()
		let col = cols.remove(fi)
		cols.insert(insert_fi, col)
		e.cols = cols_from_array(cols)
	}

	// param nav --------------------------------------------------------------

	function params_changed() {
		e.reload()
	}

	function bind_param_nav_cols(nav, params, on) {
		if (on && !e.attached)
			return
		if (!(nav && params))
			return
		nav.on('focused_row_changed', params_changed, on)
		nav.on('loaded'             , params_changed, on)
		for (let param of params.split(/\s+/))
			nav.on('focused_row_val_changed_for_'+param, params_changed, on)
	}

	function bind_param_nav(on) {
		bind_param_nav_cols(e.param_nav, e.params, on)
	}

	e.set_param_nav = function(nav1, nav0) {
		bind_param_nav_cols(nav0, e.params, false)
		bind_param_nav_cols(nav1, e.params, true)
	}
	e.prop('param_nav', {store: 'var', private: true})
	e.prop('param_nav_name', {store: 'var', bind: 'param_nav', type: 'nav', text: 'Param Nav'})

	e.set_params = function(params1, params0) {
		bind_param_nav_cols(e.param_nav, params1, false)
		bind_param_nav_cols(e.param_nav, params0, true)
	}
	e.prop('params', {store: 'var'})

	// all rows in load order -------------------------------------------------

	function init_all_rows(def) {
		e.update_load_fail(false)
		// TODO: unbind_filter_rowsets()
		e.all_rows = e.attached && def.rows || []
		init_tree()
		init_rows()
	}

	// filtered and custom-sorted subset of all_rows --------------------------

	function create_rows() {
		e.rows = []
		if (e.attached) {
			let i = 0
			let passes = return_true // TODO: e.filter_rowsets_filter(e.filter_rowsets)
			for (let row of e.all_rows)
				if (!row.parent_collapsed && passes(row))
					e.rows.push(row)
		}
	}

	function init_rows() {
		create_rows()
		sort_rows()
	}

	e.row_index = function(row) {
		return row && row[e.all_fields.length]
	}

	function update_row_index() {
		let index_fi = e.all_fields.length
		for (let i = 0; i < e.rows.length; i++)
			e.rows[i][index_fi] = i
	}

	// navigation and selection -----------------------------------------------

	e.focused_row = null
	e.focused_field = null
	e.last_focused_col = null
	e.selected_row = null
	e.selected_field = null
	e.selected_rows = new Map()

	e.property('focused_row_index'   , () => e.row_index(e.focused_row))
	e.property('focused_field_index' , () => e.field_index(e.focused_field))
	e.property('selected_row_index'  , () => e.row_index(e.selected_row))
	e.property('selected_field_index', () => e.field_index(e.selected_field))

	e.can_focus_cell = function(row, field, for_editing) {
		return (!row || row.focusable != false)
			&& (field == null || (e.can_focus_cells && field.focusable != false))
			&& (!for_editing || e.can_change_val(row, field))
	}

	e.can_change_val = function(row, field) {
		return e.can_edit && e.can_change_rows
			&& (!row || (row.editable != false && !row.removed))
			&& (!field || field.editable)
			&& e.can_focus_cell(row, field)
	}

	e.is_cell_disabled = function(row, field) {
		return !e.can_focus_cell(row, field)
	}

	e.can_select_cell = function(row, field, for_editing) {
		return e.can_focus_cell(row, field, for_editing)
			&& (e.can_select_non_siblings
				|| e.selected_rows.size == 0
				|| row.parent_row == e.selected_rows.keys().next().value.parent_row)
	}

	e.first_focusable_cell = function(ri, fi, rows, cols, options) {

		if (ri === true) ri = e.focused_row_index
		if (fi === true) fi = e.field_index(e.all_fields[e.last_focused_col])
		rows = or(rows, 0) // by default find the first focusable row.
		cols = or(cols, 0) // by default find the first focusable col.

		let editable = options && options.editable // skip non-editable cells.
		let must_move = options && options.must_move // return only if moved.
		let must_not_move_row = options && options.must_not_move_row // return only if row not moved.
		let must_not_move_col = options && options.must_not_move_col // return only if col not moved.

		let ri_inc = strict_sign(rows)
		let fi_inc = strict_sign(cols)
		rows = abs(rows)
		cols = abs(cols)

		// if starting from nowhere, include the first/last row/col into the count.
		if (ri == null && rows)
			rows--
		if (fi == null && cols)
			cols--

		let move_row = rows >= 1
		let move_col = cols >= 1
		let start_ri = ri
		let start_fi = fi

		// the default cell is the first or the last depending on direction.
		ri = or(ri, ri_inc * -1/0)
		fi = or(fi, fi_inc * -1/0)

		// clamp out-of-bound row/col indices.
		ri = clamp(ri, 0, e.rows.length-1)
		fi = clamp(fi, 0, e.fields.length-1)

		let last_valid_ri = null
		let last_valid_fi = null
		let last_valid_row

		// find the last valid row, stopping after the specified row count.
		if (e.can_focus_cell(null, null, editable))
			while (ri >= 0 && ri < e.rows.length) {
				let row = e.rows[ri]
				if (e.can_focus_cell(row, null, editable)) {
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
			if (e.can_focus_cell(last_valid_row, field, editable)) {4
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

	e.focus_cell = function(ri, fi, rows, cols, ev) {

		if (ri === false || fi === false) { // false means unfocus.
			if (!e.rows.length)
				return true
			return e.focus_cell(
				ri === false ? null : ri,
				fi === false ? null : fi, 0, 0,
				update({
					must_not_move_row: ri === false,
					must_not_move_col: fi === false,
					unfocus_if_not_found: true,
				}, ev)
			)
		}

		let was_editing = (ev && ev.was_editing) || !!e.editor
		let focus_editor = (ev && ev.focus_editor) || (e.editor && e.editor.hasfocus)
		let enter_edit = (ev && ev.enter_edit) || (was_editing && e.stay_in_edit_mode)
		let editable = (ev && ev.editable) || enter_edit
		let force_exit_edit = (ev && ev.force_exit_edit)
		let expand_selection = ev && ev.expand_selection && e.can_select_multiple
		let invert_selection = ev && ev.invert_selection && e.can_select_multiple

		let opt = update({editable: editable}, ev)
		;[ri, fi] = e.first_focusable_cell(ri, fi, rows, cols, opt)

		if (ri == null) // failure to find row means cancel.
			if (!(ev && ev.unfocus_if_not_found))
				return false

		let row_changed   = e.focused_row_index   != ri
		let field_changed = e.focused_field_index != fi

		if (row_changed) {
			if (!e.exit_focused_row(force_exit_edit))
				return false
		} else if (field_changed) {
			if (!e.exit_edit(force_exit_edit))
				return false
		}

		let last_ri = e.focused_row_index
		let last_fi = e.focused_field_index
		let ri0 = or(e.selected_row_index  , last_ri)
		let fi0 = or(e.selected_field_index, last_fi)
		let row0 = e.focused_row

		e.focused_row = e.rows[ri]
		e.focused_field = e.fields[fi]
		if (e.focused_field != null)
			e.last_focused_col = e.focused_field.name

		let row = e.rows[ri]

		if (e.val_field && row) {
			let val = e.cell_vall(row, e.val_field)
			e.set_val(val, update({input: e}, ev))
		}

		let sel_rows_changed
		if (ev && ev.preserve_selection) {
			// leave it
		} else if (ev && ev.selected_rows) {
			e.selected_rows = new Map(ev.selected_rows)
			sel_rows_changed = true
		} else if (e.can_focus_cells) {
			if (expand_selection) {
				e.selected_rows.clear()
				let ri1 = min(ri0, ri)
				let ri2 = max(ri0, ri)
				let fi1 = min(fi0, fi)
				let fi2 = max(fi0, fi)
				for (let ri = ri1; ri <= ri2; ri++) {
					let row = e.rows[ri]
					if (e.can_select_cell(row)) {
						let sel_fields = new Set()
						for (let fi = fi1; fi <= fi2; fi++) {
							let field = e.fields[fi]
							if (e.can_select_cell(row, field)) {
								sel_fields.add(field)
								sel_rows_changed = true
							}
						}
						if (sel_fields.size)
							e.selected_rows.set(row, sel_fields)
						else
							e.selected_rows.delete(row)
					}
				}
			} else {
				let sel_fields = e.selected_rows.get(row) || new Set()
				if (!invert_selection) {
					e.selected_rows.clear()
					sel_fields = new Set()
				}
				let field = e.fields[fi]
				if (sel_fields.has(field))
					sel_fields.delete(field)
				else
					sel_fields.add(field)
				if (sel_fields.size && row)
					e.selected_rows.set(row, sel_fields)
				else
					e.selected_rows.delete(row)
				sel_rows_changed = true
			}
		} else {
			if (expand_selection) {
				e.selected_rows.clear()
				let ri1 = min(ri0, ri)
				let ri2 = max(ri0, ri)
				for (let ri = ri1; ri <= ri2; ri++) {
					let row = e.rows[ri]
					if (!e.selected_rows.has(row)) {
						if (e.can_select_cell(row)) {
							e.selected_rows.set(row, true)
							sel_rows_changed = true
						}
					}
				}
			} else {
				if (!invert_selection)
					e.selected_rows.clear()
				if (row)
					if (e.selected_rows.has(row))
						e.selected_rows.delete(row)
					else
						e.selected_rows.set(row, true)
				sel_rows_changed = true
			}
		}

		e.selected_row = expand_selection ? e.rows[ri0] : null
		e.selected_field = expand_selection ? e.fields[fi0] : null

		if (row_changed)
			e.fire('focused_row_changed', row, row0, ev)

		if (sel_rows_changed)
			e.fire('selected_rows_changed')

		if (row_changed || sel_rows_changed || field_changed)
			e.update({focus: true})

		if (enter_edit && ri != null && fi != null)
			e.enter_edit(ev && ev.editor_state, focus_editor || false)

		if (!(ev && ev.make_visible == false))
			if (e.focused_row)
				e.scroll_to_cell(e.focused_row_index, e.focused_field_index)

		return true
	}

	e.scroll_to_focused_cell = function() {
		if (e.focused_row_index != null)
			e.scroll_to_cell(e.focused_row_index, e.focused_field_index)
	}

	e.focus_next_cell = function(cols, ev) {
		let dir = strict_sign(cols)
		let auto_advance_row = ev && ev.auto_advance_row || e.auto_advance_row
		return e.focus_cell(true, true, dir * 0, cols, update({must_move: true}, ev))
			|| (auto_advance_row && e.focus_cell(true, true, dir, dir * -1/0, ev))
	}

	e.is_last_row_focused = function() {
		let [ri] = e.first_focusable_cell(true, true, 1, 0, {must_move: true})
		return ri == null
	}

	function clear_selection() {
		e.selected_row   = null
		e.selected_field = null
		e.selected_rows.clear()
	}

	function reset_selection() {
		let sel_rows_size_before = e.selected_rows.size
		clear_selection()
		if (e.focused_row) {
			let sel_fields = true
			if (e.can_focus_cells && e.focused_field) {
				sel_fields = new Set()
				sel_fields.add(e.focused_field_index)
			}
			e.selected_rows.set(e.focused_row, sel_fields)
		}
		if (sel_rows_size_before)
			e.fire('selected_rows_changed')
	}

	e.select_all_cells = function(fi) {
		let sel_rows_size_before = e.selected_rows.size
		e.selected_rows.clear()
		let of_field = e.fields[fi]
		for (let row of e.rows)
			if (e.can_select_cell(row)) {
				let sel_fields = true
				if (e.can_focus_cells) {
					sel_fields = new Set()
					for (let field of e.fields)
						if (e.can_select_cell(row, field) && (of_field == null || field == of_field))
							sel_fields.add(field)
				}
				e.selected_rows.set(row, sel_fields)
			}
		e.update({focus: true})
		if (sel_rows_size_before != e.selected_rows.size)
			e.fire('selected_rows_changed')
	}

	e.is_row_selected = function(row) {
		return e.selected_rows.has(row)
	}

	function refocus_state(how) {
		let was_editing = !!e.editor
		let focus_editor = e.editor && e.editor.hasfocus

		let refocus_pk, refocus_row
		if (how == 'pk')
			refocus_pk = e.focused_row ? e.pk_vals(e.focused_row) : null
		else if (how == 'row')
			refocus_row = e.focused_row

		return function() {
			if (!e.rows.length)
				return

			let row, unfocus_if_not_found
			if (how == 'val' && e.val_field && e.nav && e.field) {
				row = e.lookup(e.val_field, e.input_val)
				unfocus_if_not_found = true
			} else if (how == 'pk' && e.pk_fields && e.pk_fields.length)
				row = e.lookup(e.pk_fields, refocus_pk)
			else if (how == 'row')
				row = refocus_row
			let ri = e.row_index(row)

			e.focus_cell(ri, true, 0, 0, {
				must_not_move_row: !e.auto_focus_first_cell,
				unfocus_if_not_found: unfocus_if_not_found,
				enter_edit: e.auto_edit_first_cell,
				was_editing: was_editing,
				focus_editor: focus_editor,
				preserve_selection: true,
			})

		}
	}

	// vlookup ----------------------------------------------------------------

	function lookup_function(field, on) {

		let index

		function lookup(v) {
			return index.get(v)
		}

		lookup.rebuild = function() {
			index = new Map()
			let fi = field.val_index
			for (let row of e.all_rows) {
				index.set(row[fi], row)
			}
		}

		lookup.row_added = function(row) {
			index.set(row[field.val_index], row)
		}

		lookup.row_removed = function(row) {
			index.delete(row[field.val_index])
		}

		lookup.val_changed = function(row, changed_field, val) {
			if (changed_field == field) {
				let prev_val = e.cell_prev_val(row, field)
				index.delete(prev_val)
				index.set(val, row)
			}
		}

		lookup.rebuild()

		return lookup
	}

	e.lookup = function(field, v) {
		if (isarray(field)) {
			field = field[0]
			// TODO: multi-key indexing
		}
		if (!field.lookup)
			field.lookup = lookup_function(field, true)
		return field.lookup(v)
	}

	function each_lookup(method, ...args) {
		if (e.all_fields)
			for (let field of e.all_fields)
				if (field.lookup)
					field.lookup[method](...args)
	}

	// tree -------------------------------------------------------------------

	e.each_child_row = function(row, f) {
		if (e.parent_field)
			for (let child_row of row.child_rows) {
				e.each_child_row(child_row, f) // depth-first
				f(child_row)
			}
	}

	function init_parents_for_row(row, parent_rows) {

		if (!init_parents_for_rows(row.child_rows))
			return // circular ref: abort.

		if (!parent_rows) {

			// reuse the parent rows array from a sibling, if any.
			let sibling_row = (row.parent_row || d).child_rows[0]
			parent_rows = sibling_row && sibling_row.parent_rows

			if (!parent_rows) {

				parent_rows = []
				let parent_row = row.parent_row
				while (parent_row) {
					if (parent_row == row || parent_rows.includes(parent_row))
						return // circular ref: abort.
					parent_rows.push(parent_row)
					parent_row = parent_row.parent_row
				}
			}
		}
		row.parent_rows = parent_rows
		return parent_rows
	}

	function init_parents_for_rows(rows) {
		let parent_rows
		for (let row of rows) {
			parent_rows = init_parents_for_row(row, parent_rows)
			if (!parent_rows)
				return // circular ref: abort.
		}
		return true
	}

	function remove_parent_rows_for(row) {
		row.parent_rows = null
		for (let child_row of row.child_rows)
			remove_parent_rows_for(child_row)
	}

	function remove_row_from_tree(row) {
		;(row.parent_row || d).child_rows.remove_value(row)
		if (row.parent_row && row.parent_row.child_rows.length == 0)
			delete row.parent_row.collapsed
		row.parent_row = null
		remove_parent_rows_for(row)
	}

	function add_row_to_tree(row, parent_row) {
		row.parent_row = parent_row
		;(parent_row || d).child_rows.push(row)
	}

	function init_tree() {

		if (!e.parent_field)
			return

		e.child_rows = []
		for (let row of e.all_rows)
			row.child_rows = []

		let p_fi = e.parent_field.val_index
		for (let row of e.all_rows)
			add_row_to_tree(row, e.lookup(e.id_field, row[p_fi]))

		if (!init_parents_for_rows(e.child_rows)) {
			// circular refs detected: revert to flat mode.
			for (let row of e.all_rows) {
				row.child_rows = null
				row.parent_rows = null
				row.parent_row = null
				print('circular ref detected')
			}
			e.child_rows = null
			e.parent_field = null
		}

	}

	// row moving -------------------------------------------------------------

	e.move_row = function(row, parent_row, ev) {
		if (!e.parent_field)
			return
		if (parent_row == row.parent_row)
			return
		assert(parent_row != row)
		assert(!parent_row || !parent_row.parent_rows.includes(row))

		let parent_id = parent_row ? e.cell_val(parent_row, e.id_field) : null
		e.set_cell_val(row, e.parent_field, parent_id, ev)

		remove_row_from_tree(row)
		add_row_to_tree(row, parent_row)

		assert(init_parents_for_row(row))
	}

	// row collapsing ---------------------------------------------------------

	function set_parent_collapsed(row, collapsed) {
		for (let child_row of row.child_rows) {
			child_row.parent_collapsed = collapsed
			if (!child_row.collapsed)
				set_parent_collapsed(child_row, collapsed)
		}
	}

	function set_collapsed_all(row, collapsed) {
		if (row.child_rows.length > 0) {
			row.collapsed = collapsed
			for (let child_row of row.child_rows) {
				child_row.parent_collapsed = collapsed
				set_collapsed_all(child_row, collapsed)
			}
		}
	}

	function set_collapsed(row, collapsed, recursive) {
		if (!row.child_rows.length)
			return
		if (recursive)
			set_collapsed_all(row, collapsed)
		else if (row.collapsed != collapsed) {
			row.collapsed = collapsed
			set_parent_collapsed(row, collapsed)
		}
	}

	e.set_collapsed = function(ri, collapsed, recursive) {
		if (ri != null)
			set_collapsed(e.rows[ri], collapsed, recursive)
		else
			for (let row of e.child_rows)
				set_collapsed(row, collapsed, recursive)

		let refocus = refocus_state('row')
		init_rows()
		refocus()
	}

	e.toggle_collapsed = function(ri, recursive) {
		e.set_collapsed(ri, !e.rows[ri].collapsed, recursive)
	}

	// sorting ----------------------------------------------------------------

	e.compare_rows = function(row1, row2) {
		// invalid rows come first.
		if (row1.invalid != row2.invalid)
			return row1.invalid ? -1 : 1
		return 0
	}

	e.compare_types = function(v1, v2) {
		// nulls come first.
		if ((v1 === null) != (v2 === null))
			return v1 === null ? -1 : 1
		// NaNs come second.
		if ((v1 !== v1) != (v2 !== v2))
			return v1 !== v1 ? -1 : 1
		return 0
	}

	e.compare_vals = function(v1, v2) {
		return v1 !== v2 ? (v1 < v2 ? -1 : 1) : 0
	}

	function field_comparator(field) {

		let compare_rows = e.compare_rows
		let compare_types = field.compare_types  || e.compare_types
		let compare_vals = field.compare_vals || e.compare_vals
		let field_index = field.val_index

		return function(row1, row2) {
			let r1 = compare_rows(row1, row2)
			if (r1) return r1

			let v1 = row1[field_index]
			let v2 = row2[field_index]

			let r2 = compare_types(v1, v2)
			if (r2) return r2

			return compare_vals(v1, v2)
		}
	}

	function row_comparator() {

		let order_by = new Map(order_by_map)

		// use index-based ordering by default, unless otherwise specified.
		if (e.index_field && order_by.size == 0)
			order_by.set(e.index_field, 'asc')

		// the tree-building comparator requires a stable sort order
		// for all parents so we must always compare rows by id after all.
		if (e.parent_field && !order_by.has(e.id_field))
			order_by.set(e.id_field, 'asc')

		let s = []
		let cmps = []
		for (let [field, dir] of order_by) {
			let i = field.val_index
			cmps[i] = field_comparator(field)
			let r = dir == 'desc' ? -1 : 1
			if (field != e.index_field) {
				// invalid rows come first
				s.push('{')
				s.push('  let v1 = r1.row_error == null')
				s.push('  let v2 = r2.row_error == null')
				s.push('  if (v1 < v2) return -1')
				s.push('  if (v1 > v2) return  1')
				s.push('}')
				// invalid vals come after
				s.push('{')
				s.push('  let v1 = !(r1.error && r1.error['+i+'] != null)')
				s.push('  let v2 = !(r2.error && r2.error['+i+'] != null)')
				s.push('  if (v1 < v2) return -1')
				s.push('  if (v1 > v2) return  1')
				s.push('}')
				// modified rows come after
				s.push('{')
				s.push('  let v1 = !r1.cells_modified')
				s.push('  let v2 = !r2.cells_modified')
				s.push('  if (v1 < v2) return -1')
				s.push('  if (v1 > v2) return  1')
				s.push('}')
			}
			// compare vals using the rowset comparator
			s.push('{')
			s.push('let cmp = cmps['+i+']')
			s.push('let r = cmp(r1, r2)')
			s.push('if (r) return r * '+r)
			s.push('}')
		}
		s.push('return 0')
		let cmp = 'let cmp = function(r1, r2) {\n\t' + s.join('\n\t') + '\n}\n; cmp;\n'

		// tree-building comparator: order elements by their position in the tree.
		if (e.parent_field) {
			// find the closest sibling ancestors of the two rows and compare them.
			let s = []
			s.push('let i1 = r1.parent_rows.length-1')
			s.push('let i2 = r2.parent_rows.length-1')
			s.push('while (i1 >= 0 && i2 >= 0 && r1.parent_rows[i1] == r2.parent_rows[i2]) { i1--; i2--; }')
			s.push('let p1 = i1 >= 0 ? r1.parent_rows[i1] : r1')
			s.push('let p2 = i2 >= 0 ? r2.parent_rows[i2] : r2')
			s.push('if (p1 == p2) return i1 < i2 ? -1 : 1') // one is parent of another.
			s.push('return cmp_direct(p1, p2)')
			cmp = cmp+'let cmp_direct = cmp; cmp = function(r1, r2) {\n\t' + s.join('\n\t') + '\n}\n; cmp;\n'
		}

		return eval(cmp)
	}

	function sort_rows(force) {
		let must_sort = !!(e.parent_field || e.index_field || order_by_map.size)
		if (must_sort)
			e.rows.sort(row_comparator())
		else if (force)
			create_rows()
		update_row_index()
		e.scroll_to_focused_cell()
	}

	// changing the sort order ------------------------------------------------

	let order_by_map = new Map()

	function update_field_sort_order() {
		order_by_map.clear()
		let pri = 0
		for (let s1 of (e.order_by || '').split(/\s+/)) {
			let m = s1.split(':')
			let name = m[0]
			let field = e.all_fields[name]
			if (field && field.sortable) {
				let dir = m[1] || 'asc'
				if (dir == 'asc' || dir == 'desc') {
					order_by_map.set(field, dir)
					field.sort_dir = dir
					field.sort_priority = pri
					pri++
				}
			}
		}
	}

	function order_by_from_map() {
		let a = []
		for (let [field, dir] of order_by_map)
			a.push(field.name + (dir == 'asc' ? '' : ' desc'))
		return a.join(' ')
	}

	e.set_order_by = function() {
		update_field_sort_order()
		sort_rows(true)
	}
	e.prop('order_by', {store: 'var'})

	e.set_order_by_dir = function(field, dir, keep_others) {
		if (!field.sortable)
			return
		if (dir == 'toggle') {
			let dir = order_by_map.get(field)
			dir = dir == 'asc' ? 'desc' : (dir == 'desc' ? false : 'asc')
		}
		if (!keep_others)
			order_by_map.clear()
		if (dir)
			order_by_map.set(field, dir)
		else
			order_by.delete(field)
		e.order_by = order_by_from_map()
	}

	// filtering --------------------------------------------------------------

	/*
	e.filter_rowset = function(field, ...opt) {

		field = e.all_fields[field]
		let rs_field = {}
		for (let k of [
			'name', 'text', 'type', 'align', 'min_w', 'max_w',
			'format', 'true_text', 'false_text', 'null_text', 'empty_text',
			'lookup_rowset', 'lookup_col', 'display_col', 'lookup_failed_display_val',
			'sortable',
		])
			rs_field[k] = field[k]

		let rs = rowset({
			fields: [
				{text: '', type: 'bool'},
				rs_field,
			],
			filtered_field: field,
		}, ...opt)

		e.reload = function() {
			let fi = field.val_index
			let rows = new Set()
			let val_set = new Set()
			for (let row of e.rows) {
				let v = row[fi]
				if (!val_set.has(v)) {
					rows.add([true, v])
					val_set.add(v)
				}
			}
			e.rows = rows
			e.fire('loaded')
		}

		return rs
	}

	e.row_filter = function(expr) {
		let expr_bin_ops = {'&&': 1, '||': 1}
		let expr_un_ops = {'!': 1}
		let s = []
		function push_expr(expr) {
			let op = expr[0]
			if (op in expr_bin_ops) {
				s.push('(')
				for (let i = 1; i < expr.length; i++) {
					if (i > 1)
						s.push(' '+op+' ')
					push_expr(expr[i])
				}
				s.push(')')
			} else if (op in expr_un_ops) {
				s.push('(')
				s.push(op)
				s.push('(')
				for (let i = 1; i < expr.length; i++)
					push_expr(expr[i])
				s.push('))')
			} else
				s.push('row['+e.all_fields[expr[1]].index+'] '+expr[0]+' '+json(expr[2]))
		}
		push_expr(expr)
		s = 'let f = function(row) {\n\treturn ' + s.join('') + '\n}; f'
		return eval(s)
	}

	e.filter_rowsets_filter = function(filter_rowsets) {
		let expr = ['&&']
		if (filter_rowsets)
			for (let [field, rs] of filter_rowsets) {
				let e = ['&&']
				for (let row of e.rows)
					if (!row[0])
						e.push(['!=', e.filtered_field.val_index, row[1]])
				if (e.length > 1)
					expr.push(e)
			}
		return expr.length > 1 ? e.row_filter(expr) : return_true
	}

	function unbind_filter_rowsets() {
		if (!e.filter_rowsets)
			return
		for (let [field, rs] of e.filter_rowsets) {
			//TODO: e.unbind()
		}
		e.filter_rowsets = null
	}

	e.filter_rowset = function(field) {
		e.filter_rowsets = e.filter_rowsets || new Map()
		let frs = e.filter_rowsets.get(field)
		if (!frs) {
			frs = e.filter_rowset(field, {
				field_attrs: {'0': {w: 20}},
			})
			e.filter_rowsets.set(field, frs)
		}
		return rs
	}

	*/

	// get/set cell & row state (storage api) ---------------------------------

	e.cell_state = function(row, field, key, default_val) {
		let v = row[key] && row[key][field.val_index]
		return v !== undefined ? v : default_val
	}

	e.set_cell_state = function(row, field, key, val, default_val) {
		let t = array_attr(row, key)
		let old_val = t[field.val_index]
		if (old_val === undefined)
			old_val = default_val
		let changed = old_val !== val
		if (changed)
			t[field.val_index] = val
		return changed
	}

	e.set_row_state = function(row, key, val, default_val, prop, ev) {
		let old_val = row[key]
		if (old_val === undefined)
			old_val = default_val
		let changed = old_val !== val
		if (changed)
			row[key] = val
		return changed
	}

	function cell_state_changed(row, field, prop, val, ev) {
		if (ev && ev.fire_changed_events === false)
			return
		e.fire('cell_state_changed', row, field, prop, val, ev)
		e.fire('cell_state_changed_for_'+field.name, row, prop, val, ev)
		e.fire(prop+'_changed', row, field, val, ev)
		e.fire(prop+'_changed_for_'+field.name, row, val, ev)

		let ri = e.row_index(row, ev && ev.row_index)
		let fi = e.field_index(field, ev && ev.field_index)
		if (fi != null) {
			e.update_cell_state(ri, fi, prop, val, ev)
			if (row == e.focused_row) {
				e.fire('focused_row_cell_state_changed_for_'+field.name, prop, val, ev)
				e.fire('focused_row_'+prop+'_changed_for_'+field.name, val, ev)
			}
		}
	}

	function row_state_changed(row, prop, val, ev) {

		let ri = e.row_index(row, ev && ev.row_index)
		e.update_row_state(ri, prop, val, ev)
		if (row == e.focused_row) {
			e.fire('focused_row_state_changed', prop, val, ev)
			e.fire('focused_row_'+prop+'_changed', val, ev)
		}

		e.fire('row_state_changed', row, prop, val, ev)
		e.fire(prop+'_changed', row, val, ev)
	}

	// get/set cell vals and cell & row state ---------------------------------

	e.cell_val       = (row, field) => row[field.val_index]
	e.cell_input_val = (row, field) => e.cell_state(row, field, 'input_val', row[field.val_index])
	e.cell_old_val   = (row, field) => e.cell_state(row, field, 'old_val'  , row[field.val_index])
	e.cell_prev_val  = (row, field) => e.cell_state(row, field, 'prev_val' , row[field.val_index])
	e.cell_error     = (row, field) => e.cell_state(row, field, 'error')
	e.cell_modified  = (row, field) => e.cell_state(row, field, 'modified', false)

	e.pk_vals = (row) => e.pk_fields.map((field) => row[field.val_index])

	e.validate_val = function(field, val, row, ev) {

		if (val == null)
			if (!field.allow_null)
				return S('error_not_null', 'NULL not allowed')
			else
				return

		if (field.min != null && val < field.min)
			return S('error_min_value', 'Value must be at least {0}').subst(field.min)

		if (field.max != null && val > field.max)
			return S('error_max_value', 'Value must be at most {0}').subst(field.max)

		let lr = field.lookup_rowset
		if (lr) {
			field.lookup_field = field.lookup_field || lr.all_fields[field.lookup_col]
			field.display_field = field.display_field || lr.all_fields[field.display_col || lr.name_col]
			if (!lr.lookup(field.lookup_field, val))
				return S('error_lookup', 'Value not found in lookup rowset')
		}

		let err = field.validate && field.validate.call(e, val, field)
		if (typeof err == 'string')
			return err

		return e.fire('validate_'+field.name, val, row, ev)
	}

	e.on_validate_val = function(col, validate, on) {
		e.on('validate_'+e.all_fields[col].name, validate, on)
	}

	e.validate_row = function(row) {
		return e.fire('validate', row)
	}

	e.can_have_children = function(row) {
		return row.can_have_children != false
	}

	e.set_row_error = function(row, err, ev) {
		err = typeof err == 'string' ? err : undefined
		if (err != null) {
			e.notify('error', err)
			print(err)
		}
		if (e.set_row_state(row, 'row_error', err))
			row_state_changed(row, 'row_error', err, ev)
	}

	e.row_has_errors = function(row) {
		if (row.row_error != null)
			return true
		for (let field of e.all_fields)
			if (e.cell_error(row, field) != null)
				return true
		return false
	}

	e.set_cell_val = function(row, field, val, ev) {
		if (val === undefined)
			val = null
		let err = e.validate_val(field, val, row, ev)
		err = typeof err == 'string' ? err : undefined
		let invalid = err != null
		let cur_val = row[field.val_index]
		let val_changed = !invalid && val !== cur_val

		let input_val_changed = e.set_cell_state(row, field, 'input_val', val, cur_val)
		let cell_err_changed = e.set_cell_state(row, field, 'error', err)
		let row_err_changed = e.set_row_state(row, 'row_error')

		if (val_changed) {
			let was_modified = e.cell_modified(row, field)
			let modified = val !== e.cell_old_val(row, field)

			row[field.val_index] = val
			e.set_cell_state(row, field, 'prev_val', cur_val)
			if (!was_modified)
				e.set_cell_state(row, field, 'old_val', cur_val)
			let cell_modified_changed = e.set_cell_state(row, field, 'modified', modified, false)
			let row_modified_changed = modified && (!(ev && ev.row_not_modified))
				&& e.set_row_state(row, 'cells_modified', true, false)

			each_lookup('val_changed', row, field, val)

			cell_state_changed(row, field, 'val', val, ev)
			if (cell_modified_changed)
				cell_state_changed(row, field, 'cell_modified', modified, ev)
			if (row_modified_changed)
				row_state_changed(row, 'row_modified', true, ev)
			row_changed(row)
		}

		if (input_val_changed)
			cell_state_changed(row, field, 'input_val', val, ev)
		if (cell_err_changed)
			cell_state_changed(row, field, 'cell_error', err, ev)
		if (row_err_changed)
			row_state_changed(row, 'row_error', undefined, ev)

		return !invalid
	}

	e.reset_cell_val = function(row, field, val, ev) {
		if (val === undefined)
			val = null
		let cur_val = row[field.val_index]
		let input_val_changed = e.set_cell_state(row, field, 'input_val', val, cur_val)
		let cell_modified_changed = e.set_cell_state(row, field, 'modified', false, false)
		e.set_cell_state(row, field, 'old_val', val)
		if (val !== cur_val) {
			row[field.val_index] = val
			e.set_cell_state(row, field, 'prev_val', cur_val)

			cell_state_changed(row, field, 'val', val, ev)
		}

		if (input_val_changed)
			cell_state_changed(row, field, 'input_val', val, ev)
		if (cell_modified_changed)
			cell_state_changed(row, field, 'cell_modified', false, ev)
	}

	// responding to cell updates ---------------------------------------------

	// TODO:
	function display_vals_changed(field) {
		e.update({vals: true})
	}

	// responding to val changes ----------------------------------------------

	e.update_val = function(v, ev) {
		if (ev && ev.input == e)
			return // coming from focus_cell(), avoid recursion.
		if (!e.val_field)
			return // fields not initialized yet.
		let row = e.lookup(e.val_field, v)
		let ri = e.row_index(row)
		e.focus_cell(ri, true, 0, 0,
			update({
				must_not_move_row: true,
				must_not_move_col: true,
				unfocus_if_not_found: true,
			}, ev))
	}

	// editing ----------------------------------------------------------------

	e.editor = null

	e.create_editor = function(field, ...opt) {
		e.editor = field.editor({
			nav: e,
			col: field.name,
		}, ...opt)
	}

	e.enter_edit = function(editor_state, focus) {
		if (e.editor)
			return true
		if (!e.can_focus_cell(e.focused_row, e.focused_field, true))
			return false
		e.create_editor(e.focused_field)
		if (!e.editor)
			return false
		e.update_cell_editing(e.focused_row_index, e.focused_field_index, true)
		e.editor.on('lost_focus', editor_lost_focus)
		if (e.editor.enter_editor)
			e.editor.enter_editor(editor_state)
		if (focus != false)
			e.editor.focus()
		return true
	}

	function free_editor() {
		let editor = e.editor
		if (editor) {
			e.editor = null // removing the editor first as a barrier for lost_focus().
			editor.remove()
		}
	}

	e.exit_edit = function(force) {
		if (!e.editor)
			return true

		if (!force)
			if (!e.can_exit_edit_on_errors && e.row_has_errors(e.focused_row))
				return false

		if (!e.fire('exit_edit', e.focused_row_index, e.focused_field_index, force))
			if (!force)
				return false

		if (e.save_row_on == 'exit_edit')
			e.save(e.focused_row)

		if (!force)
			if (!e.can_exit_row_on_errors && e.row_has_errors(e.focused_row))
				return false

		let had_focus = e.hasfocus
		free_editor()
		e.update_cell_editing(e.focused_row_index, e.focused_field_index, false)
		if (had_focus)
			e.focus()

		return true
	}

	function editor_lost_focus(ev) {
		if (!e.editor) // editor is being removed.
			return
		if (ev.target != e.editor) // other input that bubbled up.
			return
		if (e.exit_edit_on_lost_focus)
			e.exit_edit()
	}

	e.exit_focused_row = function(force) {
		let row = e.focused_row
		if (!row)
			return true
		if (!e.exit_edit(force))
			return false
		if (row.cells_modified) {
			let err = e.validate_row(row)
			e.set_row_error(row, err)
		}
		if (!force)
			if (!e.can_exit_row_on_errors && e.row_has_errors(row))
				return false
		if (e.save_row_on == 'exit_row'
			|| (e.save_row_on && row.is_new  && e.insert_row_on == 'exit_row')
			|| (e.save_row_on && row.removed && e.remove_row_on == 'exit_row')
		) {
			e.save(row)
		}
		return true
	}

	e.set_null_selected_cells = function() {
		for (let [row, sel_fields] of e.selected_rows)
			for (let field of (isobject(sel_fields) ? sel_fields : e.fields))
				if (e.can_change_val(row, field))
					e.set_cell_val(row, field, null)
	}

	// get/set display val ----------------------------------------------------

	function bind_lookup_rowsets(on) {
		for (let field of e.all_fields) {
			let lr = field.lookup_rowset
			if (lr) {
				if (on && !field.lookup_rowset_loaded) {
					field.lookup_rowset_loaded = function() {
						field.lookup_field  = lr.all_fields[field.lookup_col]
						field.display_field = lr.all_fields[field.display_col || lr.name_col]
						e.fire('display_vals_changed', field)
						e.fire('display_vals_changed_for_'+field.name)
					}
					field.lookup_rowset_display_vals_changed = function() {
						e.fire('display_vals_changed', field)
						e.fire('display_vals_changed_for_'+field.name)
					}
					field.lookup_rowset_loaded()
				}
				lr.on('loaded'      , field.lookup_rowset_loaded, on)
				lr.on('row_added'   , field.lookup_rowset_display_vals_changed, on)
				lr.on('row_removed' , field.lookup_rowset_display_vals_changed, on)
				lr.on('input_val_changed_for_'+field.lookup_col,
					field.lookup_rowset_display_vals_changed, on)
				lr.on('input_val_changed_for_'+(field.display_col || lr.name_col),
					field.lookup_rowset_display_vals_changed, on)
			}
		}
	}

	e.cell_display_val = function(row, field) {
		let v = e.cell_input_val(row, field)
		if (v == null)
			return field.null_text
		if (v === '')
			return field.empty_text
		let lr = field.lookup_rowset
		if (lr) {
			let lf = field.lookup_field
			if (lf) {
				let row = lr.lookup(lf, v)
				if (row)
					return lr.display_val(row, field.display_field)
			}
			return field.lookup_failed_display_val(v)
		} else
			return field.format(v, row)
	}

	e.cell_text_val = function(row, field) {
		let v = e.cell_display_val(row, field)
		if (v instanceof Node)
			return v.textContent
		if (typeof v != 'string')
			return ''
		return v
	}

	// row adding & removing --------------------------------------------------

	function add_row(values, ev) {
		if (!(e.can_edit && e.can_add_rows))
			return
		let row = []
		// add server_default values or null
		for (let i = 0; i < e.all_fields.length; i++) {
			let field = e.all_fields[i]
			row[i] = or(or(values && values[field.name], field.server_default), null)
		}
		row.is_new = true
		e.all_rows.push(row)

		if (e.parent_field) {
			row.child_rows = []
			row.parent_row = ev && ev.parent_row || null
			;(row.parent_row || d).child_rows.push(row)
			if (row.parent_row) {
				// silently set parent id to be the id of the parent row before firing `row_added` event.
				let parent_id = e.cell_val(row.parent_row, e.id_field)
				e.set_cell_val(row, e.parent_field, parent_id, update({fire_changed_events: false}, ev))
			}
			assert(init_parents_for_row(row))
		}

		each_lookup('row_added', row)

		let ri = ev && ev.row_index
		if (ri != null) {
			e.rows.insert(ri, row)
			if (e.focused_row_index >= ri)
				e.focused_row_index++
		} else
			ri = e.rows.push(row)

		update_row_index()

		e.update({rows: true})

		if (ev && ev.focus_it)
			e.focus_cell(ri, true, 0, 0, ev)

		e.fire('row_added', row, ev)

		// set default client values as if they were typed in by the user.
		let set_val_ev = update({row_not_modified: true}, ev)
		for (let field of e.all_fields)
			if (field.client_default != null)
				e.set_cell_val(row, field, field.client_default, set_val_ev)

		row_changed(row)
		return row
	}

	e.insert_row = function(at_focused_row, focus_it, ev) {
		if (!e.can_edit || !e.can_add_rows)
			return false

		let at_row = at_focused_row && e.focused_row
		let parent_row = at_row ? at_row.parent_row : null

		let row = add_row(null, update({
			row_index: at_row && e.focused_row_index,
			focus_it: focus_it,
			parent_row: parent_row,
		}, ev))

		if (row && e.save_row_on && e.insert_row_on == 'input')
			e.save(row)

		return row
	}

	e.can_remove_row = function(ri) {
		if (!(e.can_edit && e.can_remove_rows))
			return false
		if (ri == null)
			return true
		let row = e.rows[ri]
		if (row.can_remove === false)
			return false
		if (row.is_new && row.save_request) {
			e.notify('error',
				S('error_remove_while_saving',
					'Cannot remove a row that is in the process of being added to the server'))
			return false
		}
		return true
	}

	e.remove_row = function(ri, ev) {

		let row = e.rows[ri]

		if ((ev && ev.forever) || row.is_new) {
			e.each_child_row(row, function(row) {
				e.all_rows.delete(row)
			})
			e.all_rows.delete(row)
			remove_row_from_tree(row)
			each_lookup('row_removed', row)

			let ri = e.row_index(row, ev && ev.row_index)
			let n = 1
			if (row.parent_rows) {
				let min_parent_rows = row.parent_rows.length + 1
				while (1) {
					let row = e.rows[ri + n]
					if (!row || row.parent_rows.length < min_parent_rows)
						break
					n++
				}
			}
			e.rows.splice(ri, n)
			update_row_index()

			e.update({rows: true})

			if (ev && ev.refocus)
				if (!e.focus_cell(ri, true, 0, 0, ev))
					e.focus_cell(ri, true, -0, 0, ev)

			e.fire('row_removed', row, ev)

		} else {

			if (!e.can_remove_row(ri))
				return

			let removed = !ev || !ev.toggle || !row.removed
			e.each_child_row(row, function(row) {
				if (e.set_row_state(row, 'removed', removed, false))
					row_state_changed(row, 'row_removed', removed, ev)
			})
			if (e.set_row_state(row, 'removed', removed, false))
				row_state_changed(row, 'row_removed', removed, ev)

			row_changed(row)

		}

		if (row && e.save_row_on && e.remove_row_on == 'input')
			e.save(row)

		return row
	}

	e.remove_selected_rows = function(ev) {
		let result = true
		for (let row of e.selected_rows.keys()) {
			if (!e.remove_row(e.row_index(row), ev))
				result = false
		}
		return result
	}

	// row moving -------------------------------------------------------------

	e.child_row_count = function(ri) {
		let n = 0
		if (e.parent_field) {
			let row = e.rows[ri]
			let min_parent_count = row.parent_rows.length + 1
			for (ri++; ri < e.rows.length; ri++) {
				let child_row = e.rows[ri]
				if (child_row.parent_rows.length < min_parent_count)
					break
				n++
			}
		}
		return n
	}

	function reset_indices_for_children_of(row) {
		let index = 1
		let min_parent_count = row ? row.parent_rows.length + 1 : 0
		for (let ri = row ? e.row_index(row) + 1 : 0; ri < e.rows.length; ri++) {
			let child_row = e.rows[ri]
			if (child_row.parent_rows.length < min_parent_count)
				break
			if (child_row.parent_row == row)
				e.set_cell_val(child_row, e.index_field, index++)
		}
	}

	e.start_move_selected_rows = function() {

		//let move_rows = []
		//for (let [row] of e.selected_rows)
		//	e.row_index(row)

		let ri1 = e.focused_row_index
		let ri2 = or(e.selected_row_index, ri1)

		let move_ri1 = min(ri1, ri2)
		let move_ri2 = max(ri1, ri2)
		let move_n = move_ri2 - move_ri1 + 1

		let move_rows = e.rows.splice(move_ri1, move_n)

		let state = {}

		state.rows = move_rows

		state.finish = function(insert_ri, parent_row) {

			e.rows.splice(insert_ri, 0, ...move_rows)

			let row = move_rows[0]
			let old_parent_row = row.parent_row
			e.move_row(row, parent_row)

			update_row_index()

			e.focused_row_index = insert_ri + (move_ri1 == ri1 ? 0 : move_n - 1)

			if (e.index_field) {

				if (e.parent_field) {
					reset_indices_for_children_of(old_parent_row)
					if (parent_row != old_parent_row)
						reset_indices_for_children_of(parent_row)
				} else {
					let index = 1
					for (let ri = 0; ri < e.rows.length; ri++)
						e.set_cell_val(e.rows[ri], e.index_field, index++)
				}

				e.update({rows: true})

			} else {

				e.update({rows: true}) // for grid
				e.update({vals: true, focus: true})

			}
		}

		return state
	}

	// ajax requests ----------------------------------------------------------

	let requests

	function add_request(req) {
		if (!requests)
			requests = new Set()
		requests.add(req)
	}

	function abort_ajax_requests() {
		if (requests)
			for (let req of requests)
				req.abort()
	}

	// url with params --------------------------------------------------------

	function make_url(params) {
		if (!e.param_nav || !e.params)
			return e.url
		if (!params) {
			params = {}
			for (let s of e.params.split(/\s+/)) {
				let p = s.split('=')
				let param = p && p[0] || s
				let col = p && (p[1] || p[0]) || param
				let field = e.param_nav.all_fields[col]
				let row = e.param_nav.focused_row
				let v = row ? e.param_nav.cell_val(row, field) : null
				params[param] = v
			}
		}
		return url(e.url, {params: json(params)})
	}

	// loading ----------------------------------------------------------------

	e.reload = function(params) {
		params = or(params, e.params)
		if (!e.url)
			return
		if (requests && requests.size && !e.load_request) {
			e.notify('error',
				S('error_load_while_saving', 'Cannot reload while saving is in progress.'))
			return
		}
		e.abort_loading()
		let req = ajax({
			url: make_url(params),
			progress: load_progress,
			success: e.reset,
			fail: load_fail,
			done: load_done,
			slow: load_slow,
			slow_timeout: e.slow_timeout,
		})
		add_request(req)
		e.load_request = req
		e.loading = true
		loading(true)
		req.send()
	}

	e.load = function() {
		e.load = noop
		e.reload()
	}

	e.load_fields = function() {
		e.load_fields = noop
		e.reload(update({limit: 0}, e.params))
	}

	e.abort_loading = function() {
		if (!e.load_request)
			return
		e.load_request.abort()
		e.load_request = null
	}

	function load_progress(p, loaded, total) {
		e.update_load_progress(p, loaded, total)
		e.fire('load_progress', p, loaded, total)
	}

	function load_slow(show) {
		e.update_load_slow(show)
		e.fire('load_slow', show)
	}

	function load_done() {
		requests.delete(this)
		e.load_request = null
		e.loading = false
		loading(false)
	}

	e.reset = function(res) {

		let refocus = refocus_state('pk')
		force_unfocus_focused_cell()

		e.changed_rows = null

		e.can_edit        = and(or(true, res.can_edit        ), e.can_edit)
		e.can_add_rows    = and(or(true, res.can_add_rows    ), e.can_add_rows)
		e.can_remove_rows = and(or(true, res.can_remove_rows ), e.can_remove_rows)
		e.can_change_rows = and(or(true, res.can_change_rows ), e.can_change_rows)

		init_all(res)
		e.update({fields: true, rows: true})
		refocus()
		e.fire('loaded', true)

	}

	function load_fail(type, status, message, body) {
		let err
		if (type == 'http')
			err = S('error_http', 'Server returned {0} {1}').subst(status, message)
		else if (type == 'network')
			err = S('error_load_network', 'Loading failed: network error.')
		else if (type == 'timeout')
			err = S('error_load_timeout', 'Loading failed: timed out.')
		if (err)
			e.notify('error', err, body)
		e.update_load_fail(true, err, type, status, message, body)
		e.fire('load_fail', err, type, status, message, body)
	}

	// saving changes ---------------------------------------------------------

	function row_changed(row) {
		if (row.is_new)
			if (!row.row_modified)
				return
			else assert(!row.removed)
		e.changed_rows = e.changed_rows || new Set()
		e.changed_rows.add(row)
		e.fire('row_changed', row)
	}

	function add_row_changes(row, rows) {
		if (row.save_request)
			return // currently saving this row.
		if (row.is_new) {
			let t = {type: 'new', values: {}}
			for (let fi = 0; fi < e.all_fields.length; fi++) {
				let field = e.all_fields[fi]
				let val = row[fi]
				if (val !== field.server_default)
					t.values[field.name] = val
			}
			rows.push(t)
		} else if (row.removed) {
			let t = {type: 'remove', values: {}}
			for (let field of e.pk_fields)
				t.values[field.name] = e.cell_old_val(row, field)
			rows.push(t)
		} else if (row.cells_modified) {
			let t = {type: 'update', values: {}}
			let found
			for (let field of e.all_fields) {
				if (e.cell_modified(row, field)) {
					t.values[field.name] = row[field.val_index]
					found = true
				}
			}
			if (found) {
				for (let field of e.pk_fields)
					t.values[field.name+':old'] = e.cell_old_val(row, field)
				rows.push(t)
			}
		}
	}

	e.pack_changes = function(row) {
		let changes = {rows: []}
		if (!row) {
			for (let row of e.changed_rows)
				add_row_changes(row, changes.rows)
		} else
			add_row_changes(row, changes.rows)
		return changes
	}

	e.apply_result = function(result, changed_rows) {
		for (let i = 0; i < result.rows.length; i++) {
			let rt = result.rows[i]
			let row = changed_rows[i]

			let err = typeof rt.error == 'string' ? rt.error : undefined
			let row_failed = rt.error != null
			e.set_row_error(row, err)

			if (rt.remove) {
				e.remove_row(row, {forever: true, refocus: true})
			} else {
				if (!row_failed) {
					if (e.set_row_state(row, 'is_new', false, false))
						row_state_changed(row, 'row_is_new', false)
					if (e.set_row_state(row, 'cells_modified', false, false))
						row_state_changed(row, 'row_modified', false)
				}
				if (rt.field_errors) {
					for (let k in rt.field_errors) {
						let field = e.all_fields[k]
						let err = rt.field_errors[k]
						err = typeof err == 'string' ? err : undefined
						if (e.set_cell_state(row, field, 'error', err))
							cell_state_changed(row, field, 'cell_error', err)
					}
				} else {
					if (rt.values)
						for (let k in rt.values)
							e.reset_cell_val(row, e.all_fields[k], rt.values[k])
				}
			}
		}
		if (result.sql_trace && result.sql_trace.length)
			print(result.sql_trace.join('\n'))
	}

	function set_save_state(rows, req) {
		for (let row of e.all_rows)
			e.set_row_state(row, 'save_request', req)
	}

	e.save_to_url = function(row, url) {
		let req = ajax({
			url: url,
			upload: e.pack_changes(row),
			changed_rows: Array.from(e.changed_rows),
			success: save_success,
			fail: save_fail,
			done: save_done,
			slow: save_slow,
			slow_timeout: e.slow_timeout,
		})
		e.changed_rows = null
		add_request(req)
		set_save_state(req.rows, req)
		e.fire('saving', true)
		req.send()
	}

	e.save = function(row) {
		if (!e.changed_rows)
			return
		if (e.url)
			e.save_to_url(e.url, row)
	}

	function save_slow(show) {
		e.fire('saving_slow', show)
	}

	function save_done() {
		requests.delete(this)
		set_save_state(this.rows, null)
		e.fire('saving', false)
	}

	function save_success(result) {
		e.apply_result(result, this.changed_rows)
	}

	function save_fail(type, status, message, body) {
		let err
		if (type == 'http')
			err = S('error_http', 'Server returned {0} {1}').subst(status, message)
		else if (type == 'network')
			err = S('error_save_network', 'Saving failed: network error.')
		else if (type == 'timeout')
			err = S('error_save_timeout', 'Saving failed: timed out.')
		if (err)
			e.notify('error', err, body)
		e.fire('save_fail', err, type, status, message, body)
	}

	e.revert = function() {
		if (!e.changed_rows)
			return
			/*
		for (let row of e.changed_rows)
			if (row.is_new)
				//
			else if (row.removed)
				//
			else if (row.cells_modified)
				//
			*/
		e.changed_rows = null
	}

	// responding to notifications from rowset --------------------------------

	e.notify = function(type, message, ...args) {
		notify(message, type)
		e.fire('notify', type, message, ...args)
	}

	e.update_loading = function(on) { // stub
		if (!on) return
		e.load_overlay(true)
	}

	function loading(on) {
		e.class('loading', on)
		e.update_loading(on)
		e.update_load_progress(0)
		e.fire('loading', on)
	}

	e.update_load_progress = noop // stub

	e.update_load_slow = function(on) { // stub
		if (on)
			e.load_overlay(true, 'waiting',
				S('slow', 'Still working on it...'),
				S('stop_waiting', 'Stop waiting'))
		else
			e.load_overlay(true, 'waiting',
				S('loading', 'Loading...'),
				S('stop_loading', 'Stop loading'))
	}

	e.update_load_fail = function(on, error, type, status, message, body) {
		if (!e.attached)
			return
		if (type == 'abort')
			e.load_overlay(false)
		else
			e.load_overlay(on, 'error', error, null, body)
	}

	// loading overlay --------------------------------------------------------

	{
	let oe
	e.load_overlay = function(on, cls, text, cancel_text, detail) {
		if (oe) {
			oe.remove()
			oe = null
		}
		e.disabled = on
		e.class('disabled', e.disabled)
		if (!on)
			return
		oe = overlay({class: 'x-loading-overlay'})
		oe.content.class('x-loading-overlay-message')
		if (cls)
			oe.class(cls)
		let focus_e
		if (cls == 'error') {
			let more_div = div({class: 'x-loading-overlay-detail'})
			let band = action_band({
				layout: 'more... less... < > retry:ok forget-it:cancel',
				buttons: {
					more: function() {
						more_div.set(detail, 'pre-wrap')
						band.at[0].hide()
						band.at[1].show()
					},
					less: function() {
						more_div.clear()
						band.at[0].show()
						band.at[1].hide()
					},
					retry: function() {
						e.load_overlay(false)
						e.reload()
					},
					forget_it: function() {
						e.load_overlay(false)
					},
				},
			})
			band.at[1].hide()
			let error_icon = span({class: 'x-loading-error-icon fa fa-exclamation-circle'})
			oe.content.add(div({}, error_icon, text, more_div, band))
			focus_e = band.last.prev
		} else if (cls == 'waiting') {
			let cancel = button({
				text: cancel_text,
				action: function() {
					e.abort_loading()
				},
				attrs: {style: 'margin-left: 1em;'},
			})
			oe.content.add(text, cancel)
			focus_e = cancel
		} else
			oe.content.remove()
		e.add(oe)
		if(focus_e && e.hasfocus)
			focus_e.focus()
	}
	}

	// crude quick-search only for the first letter ---------------------------

	let found_row_index
	function quicksearch(c, field, again) {
		if (e.focused_row_index != found_row_index)
			found_row_index = null // user changed selection, start over.
		let ri = found_row_index != null ? found_row_index+1 : 0
		if (ri >= e.rows.length)
			ri = null
		while (ri != null) {
			let s = e.cell_text_val(e.rows[ri], field)
			if (s.starts(c.lower()) || s.starts(c.upper())) {
				e.focus_cell(ri, true, 0, 0, {input: e})
				break
			}
			ri++
			if (ri >= e.rows.length)
				ri = null
		}
		found_row_index = ri
		if (found_row_index == null && !again)
			quicksearch(c, field, true)
	}

	e.quicksearch = function(c, field) {
		field = field
			||	e.quicksearch_field
			|| (e.quicksearch_col && e.all_fields[e.quicksearch_col])
		if (field)
			quicksearch(c, field)
	}

	// picker protocol --------------------------------------------------------

	e.pick_near_val = function(delta, ev) {
		if (e.focus_cell(true, true, delta, 0, ev))
			e.fire('val_picked', ev)
	}

	init_all(e)

}

function global_rowset(name, ...options) {
	let d = name
	if (typeof name == 'string') {
		d = global_rowset[name]
		if (!d) {
			d = rowset({url: 'rowset.json/'+name, name: name}, ...options)
			global_rowset[name] = d
		}
	}
	return d
}

// ---------------------------------------------------------------------------
// field types
// ---------------------------------------------------------------------------

{

	all_field_types = {
		w: 100,
		min_w: 20,
		max_w: 2000,
		align: 'left',
		allow_null: true,
		editable: true,
		sortable: true,
		maxlen: 256,
		true_text: () => H('<div class="fa fa-check"></div>'),
		false_text: '',
		null_text: S('null_text', ''),
		empty_text: S('empty_text', 'empty text'),
		lookup_failed_display_val: function(v) {
			return this.format(v)
		},
	}

	all_field_types.format = function(v) {
		return String(v)
	}

	all_field_types.editor = function(...options) {
		return input({nolabel: true}, ...options)
	}

	all_field_types.to_text = function(v) {
		return v != null ? String(v) : ''
	}

	all_field_types.from_text = function(s) {
		s = s.trim()
		return s !== '' ? s : null
	}

	field_types = {}

	// numbers

	let number = {align: 'right', min: 0, max: 1/0, multiple_of: 1}
	field_types.number = number

	number.validate = function(val, field) {
		val = parseFloat(val)

		if (typeof val != 'number' || val !== val)
			return S('error_invalid_number', 'Invalid number')

		if (field.multiple_of != null)
			if (val % field.multiple_of != 0) {
				if (field.multiple_of == 1)
					return S('error_integer', 'Value must be an integer')
				return S('error_multiple', 'Value must be multiple of {0}').subst(field.multiple_of)
			}
	}

	number.editor = function(...options) {
		return spin_input(update({
			nolabel: true,
			button_placement: 'left',
		}, ...options))
	}

	number.from_text = function(s) {
		return num(s)
	}

	number.to_text = function(x) {
		return x != null ? String(x) : ''
	}

	// dates

	let date = {align: 'right', min: -(2**52), max: 2**52}
	field_types.date = date

	date.validate = function(val, field) {
		if (typeof val != 'number' || val !== val)
			return S('error_date', 'Invalid date')
	}

	date.format = function(t) {
		_d.setTime(t * 1000)
		return _d.toLocaleString(locale, this.date_format)
	}

	date.date_format =
		{weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }

	date.editor = function(...options) {
		return date_dropdown(update({
			nolabel: true,
			align: 'right',
			mode: 'fixed',
		}, ...options))
	}

	// datetime

	let datetime = {align: 'right'}
	field_types.datetime = datetime

	datetime.to_time = function(d) {
		return Date.parse(d + ' UTC') / 1000
	}

	datetime.from_time = function(t) {
		_d.setTime(t * 1000)
		return _d.toISOString().slice(0, 19).replace('T', ' ')
	}

	datetime.format = function(s) {
		let t = datetime.to_time(s)
		_d.setTime(t * 1000)
		return _d.toLocaleString(locale, this.date_format)
	}

	datetime.date_format =
		{weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }

	datetime.editor = function(...options) {
		return date_dropdown(update({
			nolabel: true,
			align: 'right',
			mode: 'fixed',
		}, ...options))
	}

	// booleans

	let bool = {align: 'center'}
	field_types.bool = bool

	bool.validate = function(val, field) {
		if (typeof val != 'boolean')
			return S('error_boolean', 'Value not true or false')
	}

	bool.format = function(val) {
		return val ? this.true_text : this.false_text
	}

	bool.editor = function(...options) {
		return checkbox(update({
			center: true,
		}, ...options))
	}

	// enums

	let enm = {}
	field_types.enum = enm

	enm.editor = function(...options) {
		return list_dropdown(update({
			nolabel: true,
			items: this.enum_values,
			mode: 'fixed',
		}, ...options))
	}

}

