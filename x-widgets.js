/*

	X-WIDGETS: Data-driven web components in JavaScript.
	Written by Cosmin Apreutesei. Public Domain.

*/

// ---------------------------------------------------------------------------
// rowset
// ---------------------------------------------------------------------------

/*
	rowset.types : {type -> {attr->val}}

	d.fields: [{attr->val}, ...]
		name           : field name (defaults to field's numeric index)
		type           : for choosing a field template.
		text           : field name for display purposes.
		client_default : default value that new rows are initialized with.
		server_default : default value that the server sets.
		allow_null     : allow null (true).
		editable       : allow modifying (true).
		sortable       : allow sorting (true).
		validate       : f(v, field) -> true|err
		format         : f(v, field) -> s
		date_format    : toLocaleString format options for dates
		true_text      : display value for boolean true
		false_text     : display value for boolean false
		align          : 'left'|'right'|'center'
		editor         : f(field) -> editor instance
		compare_types  : f(v1, v2) -> -1|0|1  (for sorting)
		compare_values : f(v1, v2) -> -1|0|1  (for sorting)

	d.rows: [{attr->val}, ...]
		values         : [v1,...]
		is_new         : new row, not added on server yet.
		removed        : removed row, not removed on server yet.
		original_values: original values on an updated but not yet saved row.

	^d.value_changed(row, field, val)
	^d.row_added(ri)
	^d.row_removed(ri)

	d.add_row()
	d.remove_row()

*/

{
	let upper = function(s) {
		return s.toUpperCase()
	}
	let upper2 = function(s) {
		return ' ' + s.slice(1).toUpperCase()
	}
	function auto_display_name(s) {
		return (s || '').replace(/[\w]/, upper).replace(/(_[\w])/, upper2)
	}
}

rowset = function(...options) {

	let d = {}

	d.can_edit        = true
	d.can_add_rows    = true
	d.can_remove_rows = true
	d.can_change_rows = true

	let fields // [fi: {name:, client_default: v, server_default: v, ...}]
	let rows   // [ri: row]; row = {values: [fi: val], attr: val, ...}
	let pk     // [field1,...]
	let field_map = new Map()

	install_events(d)

	d.field = function(v) {
		return typeof(v) == 'string' ? field_map.get(v) :
			(typeof(v) == 'number' ? fields[v] : v)
	}

	function init() {

		// set options/override.
		update(d, rowset, ...options)

		d.fields = d.fields || []
		d.rows = d.rows || []
		d.pk = d.pk || []

		// init locals.
		fields = d.fields
		rows = d.rows
		pk = []

		for (let i = 0; i < d.fields.length; i++) {
			let f1 = d.fields[i]
			let f0 = f1.type ? (d.types[f1.type] || rowset.types[f1.type]) : null
			let field = update({index: i}, rowset.default_type, d.default_type, f0, f1)
			if (field.text == null)
				field.text = auto_display_name(field.name)
			field.name = or(field.name, 'field_'+i)
			fields[i] = field
			field_map.set(field.name, field)
		}

		for (field of d.pk) {
			pk.push(d.field(field))
		}

	}

	// indexing ---------------------------------------------------------------

	d.create_index = function(fields) {

	}

	// sorting ----------------------------------------------------------------

	d.compare_rows = function(row1, row2) {
		// invalid rows come first.
		if (row1.invalid != row2.invalid)
			return row1.invalid ? -1 : 1
		return 0
	}

	d.compare_types = function(v1, v2) {
		// nulls come first.
		if ((v1 === null) != (v2 === null))
			return v1 === null ? -1 : 1
		// NaNs come second.
		if ((v1 !== v1) != (v2 !== v2))
			return v1 !== v1 ? -1 : 1
		return 0
	}

	d.compare_values = function(v1, v2) {
		return v1 !== v2 ? (v1 < v2 ? -1 : 1) : 0
	}

	d.comparator = function(field) {

		var compare_rows = d.compare_rows
		var compare_types  = field.compare_types  || d.compare_types
		var compare_values = field.compare_values || d.compare_values
		var field_index = field.index

		return function (row1, row2) {
			var r = compare_rows(row1, row2)
			if (r) return r

			let v1 = row1.values[field_index]
			let v2 = row2.values[field_index]

			var r = compare_types(v1, v2)
			if (r) return r

			return compare_values(v1, v2)
		}
	}

	// get/set cell state -----------------------------------------------------

	d.cell_state = function(row, field, key) {
		let t = row.state && row.state[field.index]
		return t && t[key]
	}

	d.set_cell_state = function(row, field, key, val, source) {
		let t = attr(array_attr(row, 'state'), field.index)
		if (t[key] === val)
			return
		t[key] = val
		d.fire(key+'_changed', row, field, val, source)
	}

	// get/set cell values ----------------------------------------------------

	d.value = function(row, field) {
		let get_value = field.get_value // computed value?
		return get_value ? get_value(field, row, fields) : row.values[field.index]
	}

	d.display_value = function(row, field) {
		return field.format.call(d, d.value(row, field), field)
	}

	d.validate_value = function(field, val) {
		if (val == null)
			return field.allow_null || 'NULL not allowed'
		let validate = field.validate
		if (!validate)
			return true
		return validate.call(d, val, field)
	}

	d.validate_row = return_true // stub

	d.can_focus_cell = function(row, field) {
		return row.focusable != false && (field == null || field.focusable != false)
	}

	d.can_change_value = function(row, field) {
		return d.can_edit && d.can_change_rows && row.editable != false
			&& (field == null || (field.editable && !field.get_value))
			&& d.can_focus_cell(row, field)
	}

	d.create_editor = function(row, field) {
		return field.editor.call(d, field, row)
	}

	d.set_value = function(row, field, val, source) {

		if (val === undefined)
			val = null

		let ret = d.can_change_value(row, field) || 'read_only'
		ret = ret === true ? d.validate_value(field, val) : ret

		let invalid = ret !== true
		d.set_cell_state(row, field, 'invalid', invalid, source)
		d.set_cell_state(row, field, 'error', invalid ? ret : undefined, source)
		if (invalid)
			d.set_cell_state(row, field, 'wrong_value', val)

		if (invalid)
			return

		let old_val = row.values[field.index]

		if (old_val === val)
			return

		row.values[field.index] = val

		if (!d.cell_state(row, field, 'modified')) {
			d.set_cell_state(row, field, 'old_value', old_val, source)
			d.set_cell_state(row, field, 'modified', true, source)
			row.modified = true
		}
		d.fire('value_changed', row, field, val, source)

		return
	}

	// add/remove rows --------------------------------------------------------

	function create_row() {
		let values = []
		// add server_default values or null
		for (let field of fields) {
			let val = field.server_default
			values.push(val != null ? val : null)
		}
		return {values: values, is_new: true}
	}

	d.add_row = function(source) {
		if (!d.can_add_rows)
			return
		let row = create_row()
		rows.push(row)
		d.fire('row_added', row, source)
		// set default client values as if they were added by the user.
		for (let field of fields)
			d.set_value(row, field, field.client_default)
		return row
	}

	d.can_remove_row = function(row) {
		if (!d.can_remove_rows)
			return false
		if (row.can_remove === false)
			return false
		return true
	}

	d.remove_row = function(row, source) {
		if (!d.can_remove_row(row))
			return
		if (row.is_new) {
			rows.remove(rows.indexOf(row))
		} else {
			// mark row as removed
			row.removed = true
		}
		d.fire('row_removed', row, source)
		return row
	}

	// changeset & resultset --------------------------------------------------

	d.pack_changeset = function() {
		let changes = {new_rows: [], updated_rows: [], removed_rows: []}
		for (let row of rows) {
			if (row.is_new) {
				let t = {}
				for (let fi = 0; fi < fields.length; fi++) {
					let field = fields[fi]
					let val = row.values[fi]
					if (val === field.server_default)
						val = null
					t[field.name] = val
				}
				changes.new_rows.push(t)
			} else if (row.modified) {
				let t = {}
				for (let fi = 0; fi < fields.length; fi++) {
					let field = fields[fi]
					if (d.cell_state(row, field, 'modified'))
						t[field.name] = row.values[fi]
				}
				changes.updated_rows.push(t)
			} else if (row.removed_rows) {
				changes.removed_rows.push({})
			}
		}
		return changes
	}

	d.unpack_resultset = function(resultset) {
		for (let row of resultset) {
			//
		}
	}

	init()

	return d
}

// ---------------------------------------------------------------------------
// field types
// ---------------------------------------------------------------------------

{
	rowset.default_type = {
		width: 50,
		align: 'left',
		client_default: null,
		server_default: null,
		allow_null: true,
		editable: true,
		sortable: true,
		validate: return_true,
		true_text: 'true',
		false_text: 'false',
	}

	rowset.default_type.format = function(v) {
		return String(v)
	}

	rowset.default_type.editor = function(field, row) {
		return input({
			validate: field.validate,
		})
	}

	rowset.types = {
		number: {align: 'right'},
		date  : {align: 'right'},
		bool  : {align: 'center'},
	}

	// numbers

	rowset.types.number.validate = function(val, field) {
		val = parseFloat(val)
		return typeof(val) == 'number' && val === val || 'invalid number'
	}

	rowset.types.number.editor = function(field, row) {
		return spin_input({
			button_placement: 'left',
		})
	}

	// dates

	rowset.types.date.validate = function(val, field) {
		return typeof(val) == 'number' && val === val || 'invalid timestamp'
	}

	rowset.types.date.format = function(t, field) {
		_d.setTime(t)
		return _d.toLocaleString(locale, field.date_format)
	}

	rowset.default_type.date_format =
		{weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }

	rowset.types.date.editor = function(field, row) {
		return dropdown({
			picker: calendar(),
			classes: 'align-right fixed',
		})
	}

	// booleans

	rowset.types.bool.validate = function(val, field) {
		return typeof(val) == 'boolean'
	}

	rowset.types.bool.format = function(val, field) {
		return val ? field.true_text : field.false_text
	}

	rowset.types.bool.editor = function(field, row) {
		return checkbox({
			center: true,
		})
	}

}

// ---------------------------------------------------------------------------
// current_row
// ---------------------------------------------------------------------------

rowset_nav = function(...options) {
	let nav = {}

	install_events(nav)

	let ri

	nav.set_row_index = function(i, source) {
		i = clamp(i, 0, nav.rowset.rows.length-1)
		if (i == ri)
			return
		ri = i
		nav.fire('row_changed', ri, source)
	}

	property(nav, 'row_index', {
		get: function() { return ri },
		set: nav.set_row_index,
	})

	property(nav, 'row', {
		get: function() { return nav.rowset.rows[ri] }
	})

	nav.value = function(field) {
		return nav.rowset.value(nav.rowset.rows[ri], nav.rowset.field(field))
	}

	nav.cell_state = function(field) {
		return nav.rowset.cell_state(nav.rowset.rows[ri], nav.rowset.field(field))
	}

	nav.set_value = function(field, v, source) {
		nav.rowset.set_value(nav.rowset.rows[ri], nav.rowset.field(field), v, source)
	}

	nav.set_cell_state = function(field, v, source) {
		return nav.rowset.set_cell_state(nav.rowset.rows[ri], nav.rowset.field(field), v, source)
	}

	update(nav, ...options)

	return nav
}

// ---------------------------------------------------------------------------
// value protocol
// ---------------------------------------------------------------------------

function validate_over_field(field, additional_validate) {
	let field_validate = field.validate
	if (!field_validate)
		field.validate = additional_validate
	else
		field.validate = function(v) {
			let ret = additional_validate(v)
			if (ret === true)
				ret = field_validate(v)
			return ret
		}
}

function value_protocol(e) {

	e.default_value = null

	let init = e.init
	e.init = function() {
		init()
		if (!e.nav) {
			let field = {type: e.field_type}
			if (e.field_name != null) field.name = e.field_name
			if (e.field_text != null) field.text = e.field_text
			let row = {values: [e.default_value]}
			let rowset_ = rowset({
				fields: [field],
				rows: [row],
			})
			e.nav = rowset_nav({rowset: rowset_, row_index: 0})
			e.field = e.nav.rowset.field(0)
		} else {
			e.field = e.nav.rowset.field(e.field_name)
		}
		if (e.validate)
			validate_over_field(e.field, e.validate)
		e.nav.on('row_changed', row_changed)
		e.nav.rowset.on('reload', reload)
		e.nav.rowset.on('value_changed', set_value)
		e.nav.rowset.on('invalid_changed', set_invalid)
		e.nav.rowset.on('error_changed', set_error)
		e.nav.rowset.on('wrong_value_changed', set_wrong_value)
	}

	function row_changed(ri, source) {
		e.update_value(e.value, source)
	}

	function reload(source) {
		e.update_value(e.value, source)
	}

	function set_value(row, field, val, source) {
		if (row != e.nav.row || field != e.field)
			return
		e.update_value(val, source)
	}

	function set_invalid(row, field, invalid, source) {
		if (row != e.nav.row || field != e.field)
			return
		e.invalid = invalid
		e.class('invalid', invalid)
	}

	function set_error(row, field, err, source) {
		if (row != e.nav.row || field != e.field)
			return
		e.update_error(err, source)
	}

	function set_wrong_value(row, field, val, source) {
		if (row != e.nav.row || field != e.field)
			return
		e.update_value(val, source)
	}

	e.late_property('value',
		function() {
			return e.nav.value(e.field)
		},
		function(v) {
			e.nav.set_value(e.field, v, e)
		}
	)

	e.update_value = function(v, source) {} // stub

	e.update_error = function(err, source) {
		if (!e.error_tooltip) {
			if (!e.invalid)
				return // don't create it until needed.
			function error_tooltip_check() { return e.invalid && (e.hasfocus || e.hovered) }
			e.error_tooltip = tooltip({type: 'error', target: e, check: error_tooltip_check})
		}
		if (e.invalid)
			e.error_tooltip.text = err
		e.error_tooltip.update()
	}

}

// ---------------------------------------------------------------------------
// button
// ---------------------------------------------------------------------------

button = component('x-button', function(e) {

	e.class('x-widget')
	e.class('x-button')
	e.attrval('tabindex', 0)

	e.icon_span = H.span({class: 'x-button-icon'})
	e.text_span = H.span({class: 'x-button-text'})
	e.add(e.icon_span, e.text_span)

	e.init = function() {

		e.icon_span.add(e.icon)
		e.icon_span.classes = e.icon_classes

		// can't use CSS for this because margins don't collapse with paddings.
		if (!(e.icon_classes || e.icon))
			e.icon_span.hide()

		e.on('keydown', keydown)
		e.on('keyup', keyup)
	}

	e.property('text', function() {
		return e.text_span.html
	}, function(s) {
		e.text_span.html = s
	})

	e.late_property('primary', function() {
		return e.hasclass('primary')
	}, function(on) {
		e.class('primary', on)
	})

	function keydown(key) {
		if (key == ' ' || key == 'Enter') {
			e.class('active', true)
			return false
		}
	}

	function keyup(key) {
		if (e.hasclass('active')) {
			// ^^ always match keyups with keydowns otherwise we might catch
			// a keyup from someone else's keydown, eg. a dropdown menu item
			// could've been selected by pressing Enter which closed the menu
			// and focused this button back and that Enter's keyup got here.
			if (key == ' ' || key == 'Enter') {
				e.click()
				e.class('active', false)
			}
			return false
		}
	}

})

// ---------------------------------------------------------------------------
// tooltip
// ---------------------------------------------------------------------------

tooltip = component('x-tooltip', function(e) {

	e.class('x-widget')
	e.class('x-tooltip')

	e.text_div = H.div({class: 'x-tooltip-text'})
	e.pin = H.div({class: 'x-tooltip-tip'})
	e.add(e.text_div, e.pin)

	e.attrval('side', 'top')
	e.attrval('align', 'center')

	let target

	e.popup_target_changed = function(target) {
		let visible = !e.check || e.check(target)
		e.class('visible', !!visible)
	}

	e.update = function() {
		e.popup(target, e.side, e.align)
	}

	e.property('text',
		function()  { return e.text_div.html },
		function(s) { e.text_div.html = s; e.update() }
	)

	e.property('visible',
		function()  { return e.style.display != 'none' },
		function(v) { return e.style.display = v ? null : 'none'; e.update() }
	)

	e.attr_property('side' , e.update)
	e.attr_property('align', e.update)
	e.attr_property('type' , e.update)

	e.late_property('target',
		function()  { return target },
		function(v) { target = v; e.update() }
	)

})


// ---------------------------------------------------------------------------
// checkbox
// ---------------------------------------------------------------------------

checkbox = component('x-checkbox', function(e) {

	e.class('x-widget')
	e.class('x-markbox')
	e.class('x-checkbox')
	e.attrval('tabindex', 0)
	e.attrval('align', 'left')

	e.checked_value = true
	e.unchecked_value = false
	e.validate = return_true
	e.allow_invalid_values = false

	e.icon_div = H.span({class: 'x-markbox-icon x-checkbox-icon fa fa-square'})
	e.text_div = H.span({class: 'x-markbox-text x-checkbox-text'})
	e.add(e.icon_div, e.text_div)

	e.init = function() {
		e.class('center', !!e.center)
		e.on('click', click)
		e.on('mousedown', mousedown)
		e.on('keydown', keydown)
		e.on('focus', focus)
		e.on('blur', blur)
	}

	e.attr_property('align')

	e.property('text', function() {
		return e.text_div.html
	}, function(s) {
		e.text_div.html = s
	})

	function set_checked(v) {
		e.class('checked', v)
		e.icon_div.class('fa-check-square', v)
		e.icon_div.class('fa-square', !v)
		e.fire(v ? 'checked' : 'unchecked')
	}

	e.show_error = function(err, focused) {
		e.tooltip = e.tooltip || tooltip()
		e.tooltip.text = err
		e.tooltip.visible = focused
	}

	let error
	function focus() { e.show_error(error, true ) }
	function blur () { e.show_error(error, false) }
	e.set_valid = function(err) {
		error = err
		e.class('invalid', err !== true)
		e.show_error(err, e.focused)
	}

	e.late_property('value',
		function() {
			return e.hasclass('checked') ? e.checked_value : e.unchecked_value
		},
		function(v) {
			let err = e.validate(v)
			e.set_valid(err)
			if (err !== true && !e.allow_invalid_values)
				return
			set_checked(v === e.checked_value)
			e.fire('value_changed', v)
		}
	)

	e.late_property('checked',
		function() {
			return e.hasclass('checked')
		},
		function(v) {
			e.value = v ? e.checked_value : e.unchecked_value
		}
	)

	e.toggle = function() {
		e.checked = !e.checked
	}

	function mousedown(ev) {
		ev.preventDefault() // prevent accidental selection by double-clicking.
		e.focus()
	}

	function click() {
		e.toggle()
		return false
	}

	function keydown(key) {
		if (key == 'Enter' || key == ' ') {
			e.toggle()
			return false
		}
	}

})

// ---------------------------------------------------------------------------
// radiogroup
// ---------------------------------------------------------------------------

radiogroup = component('x-radiogroup', function(e) {

	e.class('x-widget')
	e.class('x-radiogroup')
	e.attrval('align', 'left')

	e.items = []

	e.init = function() {
		for (let item of e.items) {
			if (typeof(item) == 'string')
				item = {text: item}
			let radio_div = H.span({class: 'x-markbox-icon x-radio-icon far fa-circle'})
			let text_div = H.span({class: 'x-markbox-text x-radio-text'})
			text_div.html = item.text
			let item_div = H.div({class: 'x-widget x-markbox x-radio-item', tabindex: 0}, radio_div, text_div)
			item_div.attrval('align', e.align)
			item_div.class('center', !!e.center)
			item_div.item = item
			item_div.on('click', item_click)
			item_div.on('keydown', item_keydown)
			e.add(item_div)
		}
	}

	e.attr_property('align')

	let sel_item

	e.late_property('value', function() {
		return sel_item.index
	}, function(i) {
		if (sel_item) {
			sel_item.class('selected', false)
			sel_item.at[0].class('fa-dot-circle', false)
			sel_item.at[0].class('fa-circle', true)
		}
		sel_item = i != null ? e.at[i] : null
		if (sel_item) {
			sel_item.class('selected', true)
			sel_item.at[0].class('fa-dot-circle', true)
			sel_item.at[0].class('fa-circle', false)
		}
		e.fire('value_changed', i)
	})

	function select_item(item) {
		e.value = item.index
		item.focus()
	}

	function item_click() {
		select_item(this)
		return false
	}

	function item_keydown(key) {
		if (key == ' ' || key == 'Enter') {
			select_item(this)
			return false
		}
		if (key == 'ArrowUp' || key == 'ArrowDown') {
			let item = e.focused_element
			let next_item = item
				&& (key == 'ArrowUp' ? (item.prev || e.last) : (item.next || e.first))
			if (next_item)
				select_item(next_item)
			return false
		}
	}

})

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------

input = component('x-input', function(e) {

	e.class('x-widget')
	e.class('x-input')

	e.attrval('align', 'left')
	e.attr_property('align')

	e.attr_property('label')

	e.input = H.input({class: 'x-input-input'})
	e.inner_label_div = H.div({class: 'x-input-inner-label'})
	e.input.set_input_filter() // must be set as first event handler!
	e.input.on('input', input_input)
	e.input.on('blur', input_blur)
	e.input.on('keydown', input_keydown)
	e.input.on('keyup', input_keyup)
	e.add(e.input, e.inner_label_div)

	// model

	value_protocol(e)

	let init = e.init
	e.init = function() {
		init()
		if (e.inner_label != false) {
			let s = e.label || e.field.text
			if (s) {
				e.inner_label_div.html = s
				e.class('with-inner-label', true)
			}
		}
		e.input.class('empty', e.input.value == '')
	}

	e.to_text = function(v) {
		return v != null ? String(v) : null
	}

	e.from_text = function(s) {
		s = s.trim()
		return s !== '' ? s : null
	}

	let from_input

	function update_state(s) {
		e.input.class('empty', s == '')
	}

	e.update_value = function(v, source) {
		if (!from_input) {
			let s = e.to_text(v)
			e.input.value = s
			update_state(s)
		}
	}

	// view

	function input_input() {
		from_input = true
		e.value = e.from_text(e.input.value)
		update_state(e.input.value)
		from_input = false
	}

	function input_blur() {
		e.fire('lost_focus') // grid editor protocol
	}

	// grid editor protocol

	e.focus = function() {
		e.input.focus()
	}

	let editor_state

	function update_editor_state(moved_forward, i0, i1) {
		i0 = or(i0, e.input.selectionStart)
		i1 = or(i1, e.input.selectionEnd)
		let anchor_left =
			e.input.selectionDirection != 'none'
				? e.input.selectionDirection == 'forward'
				: (moved_forward || e.align == 'left')
		let imax = e.input.value.length
		let leftmost  = i0 == 0
		let rightmost = (i1 == imax || i1 == -1)
		if (anchor_left) {
			if (rightmost) {
				if (i0 == i1)
					i0 = -1
				i1 = -1
			}
		} else {
			i0 = i0 - imax - 1
			i1 = i1 - imax - 1
			if (leftmost) {
				if (i0 == 1)
					i1 = 0
				i0 = 0
			}
		}
		editor_state = [i0, i1]
	}

	function input_keydown(key, shift, ctrl) {
		// NOTE: we capture Ctrl+A on keydown because the user might
		// depress Ctrl first and when we get the 'a' Ctrl is not pressed.
		if (key == 'a' && ctrl)
			update_editor_state(null, 0, -1)
	}

	function input_keyup(key, shift, ctrl) {
		if (key == 'ArrowLeft' || key == 'ArrowRight')
			update_editor_state(key == 'ArrowRight')
	}

	e.editor_state = function(s) {
		if (s) {
			let i0 = e.input.selectionStart
			let i1 = e.input.selectionEnd
			let imax = e.input.value.length
			let leftmost  = i0 == 0
			let rightmost = i1 == imax
			if (s == 'left')
				return i0 == i1 && leftmost && 'left'
			else if (s == 'right')
				return i0 == i1 && rightmost && 'right'
		} else {
			if (!editor_state)
				update_editor_state()
			return editor_state
		}
	}

	e.enter_editor = function(s) {
		if (!s)
			return
		if (s == 'select_all')
			s = [0, -1]
		else if (s == 'left')
			s = [0, 0]
		else if (s == 'right')
			s = [-1, -1]
		editor_state = s
		let [i0, i1] = s
		let imax = e.input.value.length
		if (i0 < 0) i0 = imax + i0 + 1
		if (i1 < 0) i1 = imax + i1 + 1
		e.input.select(i0, i1)
	}

})

// ---------------------------------------------------------------------------
// spin_input
// ---------------------------------------------------------------------------

spin_input = component('x-spin-input', function(e) {

	input.construct(e)

	e.class('x-spin-input')

	e.align = 'right'

	e.button_style     = 'plus-minus'
	e.button_placement = 'each-side'

	// model

	e.step =  1
	e.min  = -1/0
	e.max  =  1/0

	// view

	e.up   = H.div({class: 'x-spin-input-button fa'})
	e.down = H.div({class: 'x-spin-input-button fa'})

	let init = e.init
	e.init = function() {
		init()

		let bs = e.button_style
		let bp = e.button_placement

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
			e.down.class('left' )
			e.up  .class('right')
			e.down.class('leftmost' )
			e.up  .class('rightmost')
		} else if (bp == 'right') {
			e.add(e.down, e.up)
			e.down.class('right')
			e.up  .class('right')
			e.up  .class('rightmost')
		} else if (bp == 'left') {
			e.insert(0, e.down, e.up)
			e.down.class('left')
			e.up  .class('left')
			e.down.class('leftmost' )
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
		e.value += increment
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
			if (start_incrementing_timer || increment_timer)
				return
			e.input.focus()
			increment = e.step * sign
			increment_value()
			start_incrementing_timer = setTimeout(start_incrementing, 500)
			return false
		})
		function mouseup() {
			clearTimeout(start_incrementing_timer)
			clearInterval(increment_timer)
			start_incrementing_timer = null
			increment_timer = null
			increment = 0
		}
		button.on('mouseup', mouseup)
		button.on('mouseleave', mouseup)
	}
	add_events(e.up  , 1)
	add_events(e.down, -1)

	e.input.on('wheel', function(dy) {
		e.value += (dy / 100)
		e.input.select(0, -1)
		return false
	})

})

// ---------------------------------------------------------------------------
// slider
// ---------------------------------------------------------------------------

slider = component('x-slider', function(e) {

	e.min_value = 0
	e.max_value = 1
	e.step = null

	e.class('x-widget')
	e.class('x-slider')
	e.attrval('tabindex', 0)

	e.fill = H.div({class: 'x-slider-fill'})
	e.thumb = H.div({class: 'x-slider-thumb'})

	e.add(e.fill, e.thumb)
	e.thumb.on('mousedown', thumb_mousedown)
	e.on('mousedown', view_mousedown)
	e.on('keydown', view_keydown)

	function update_view() {
		let p = e.progress
		e.fill.style.width = (p * 100)+'%'
		e.thumb.style.left = (p * 100)+'%'
	}

	e.init = function() {
		e.class('animated', e.step >= 5)
	}

	// model

	let value

	e.late_property('value',
		function() {
			return value
		},
		function(v) {
			if (e.step != null)
				v = floor(v / e.step + .5) * e.step
			value = clamp(v, e.min_value, e.max_value)
			update_view()
			e.on('value_changed', value)
		}
	)

	e.late_property('progress',
		function() {
			return lerp(value, e.min_value, e.max_value, 0, 1)
		},
		function(p) {
			e.value = lerp(p, 0, 1, e.min_value, e.max_value)
		},
		0
	)

	// controller

	let hit_x

	function thumb_mousedown(ev) {
		e.focus()
		let r = e.thumb.client_rect()
		hit_x = ev.clientX - (r.left + r.width / 2)
		document.on('mousemove', document_mousemove)
		document.on('mouseup'  , document_mouseup)
		return false
	}

	function document_mousemove(mx, my) {
		let r = e.client_rect()
		e.progress = (mx - r.left - hit_x) / r.width
		return false
	}

	function document_mouseup() {
		hit_x = null
		document.off('mousemove', document_mousemove)
		document.off('mouseup'  , document_mouseup)
	}

	function view_mousedown(ev) {
		let r = e.client_rect()
		e.progress = (ev.clientX - r.left) / r.width
	}

	function view_keydown(key, shift) {
		let d
		switch (key) {
			case 'ArrowLeft'  : d =  -.1; break
			case 'ArrowRight' : d =   .1; break
			case 'ArrowUp'    : d =  -.1; break
			case 'ArrowDown'  : d =   .1; break
			case 'PageUp'     : d =  -.5; break
			case 'PageDown'   : d =   .5; break
			case 'Home'       : d = -1/0; break
			case 'End'        : d =  1/0; break
		}
		if (d) {
			e.progress += d * (shift ? .1 : 1)
			return false
		}
	}

})


// ---------------------------------------------------------------------------
// dropdown
// ---------------------------------------------------------------------------

dropdown = component('x-dropdown', function(e) {

	// view

	e.class('x-widget')
	e.class('x-input')
	e.class('x-dropdown')
	e.attrval('tabindex', 0)

	e.value_div = H.span({class: 'x-dropdown-value'})
	e.button = H.span({class: 'x-dropdown-button fa fa-caret-down'})
	e.add(e.value_div, e.button)

	function update_view() {
		if (!e.isConnected)
			return
		let v = e.picker.display_value
		if (v === '')
			v = '&nbsp;'
		e.value_div.html = v
	}

	function onoff_events(on) {
		document.onoff('mousedown', document_mousedown, on)
		document.onoff('stopped_event', document_stopped_event, on)
	}

	e.attach = function(parent) {
		update_view()
		onoff_events(true)
	}

	e.detach = function() {
		onoff_events(false)
		e.close()
	}

	// model

	e.late_property('value', function() {
		return e.picker.value
	}, function(v) {
		e.picker.pick_value(v)
	})

	// controller

	e.on('focusout' , view_focusout)
	e.on('mousedown', view_mousedown)
	e.on('keydown'  , view_keydown)
	e.on('keypress' , view_keypress)
	e.on('wheel'    , view_wheel)

	e.init = function() {
		e.picker.on('value_changed', value_changed)
		e.picker.on('value_picked' , value_picked)
		e.picker.on('keydown', picker_keydown)
	}

	// focusing

	let builtin_focus = e.focus
	let focusing_picker
	e.focus = function() {
		if (e.isopen) {
			focusing_picker = true // focusout barrier.
			e.picker.focus()
			focusing_picker = false
		} else
			builtin_focus.call(this)
	}

	// opening & closing

	e.set_open = function(open, focus) {
		if (e.isopen != open) {
			e.class('open', open)
			e.button.replace_class('fa-caret-down', 'fa-caret-up', open)
			e.picker.class('picker', open)
			if (open) {
				e.cancel_value = e.value
				let r = e.client_rect()
				e.picker.x = r.left   + window.scrollX
				e.picker.y = r.bottom + window.scrollY
				e.picker.min_w = r.width
				document.body.add(e.picker)
				e.fire('opened')
			} else {
				e.cancel_value = null
				e.picker.remove()
				e.fire('closed')
				if (!focus)
					e.fire('lost_focus') // grid editor protocol
			}
		}
		if (focus)
			e.focus()
	}

	e.open   = function(focus) { e.set_open(true, focus) }
	e.close  = function(focus) { e.set_open(false, focus) }
	e.toggle = function(focus) { e.set_open(!e.isopen, focus) }
	e.cancel = function(focus) {
		if (e.isopen)
			e.picker.pick_value(e.cancel_value, focus)
		else
			e.close(focus)
	}

	e.late_property('isopen',
		function() {
			return e.hasclass('open')
		},
		function(open) {
			e.set_open(open, true)
		}
	)

	// picker protocol

	function value_changed(v) {
		update_view()
	}

	function value_picked(from_input) {
		e.close(from_input)
		e.fire('value_changed', e.picker.value) // input protocol
		if (e.rowset) {
			let err = e.rowset.set_value(e.value)
			// TODO: show error
		}
	}

	// kb & mouse binding

	function view_mousedown() {
		e.toggle(true)
		return false
	}

	function view_keydown(key) {
		if (key == 'Enter' || key == ' ') {
			e.toggle(true)
			return false
		}
		if (key == 'ArrowDown' || key == 'ArrowUp') {
			if (!e.hasclass('grid-editor')) {
				e.picker.pick_near_value(key == 'ArrowDown' ? 1 : -1)
				return false
			}
		}
	}

	function view_keypress(c) {
		e.picker.pick_next_value_starting_with(c)
		return false
	}

	function picker_keydown(key, shift, ctrl, alt, ev) {
		if (key == 'Escape' || key == 'Tab') {
			e.cancel(true)
			return false
		}
	}

	function view_wheel(dy) {
		e.picker.pick_near_value(dy / 100)
		return false
	}

	// clicking outside the picker closes the picker.
	function document_mousedown(ev) {
		if (e.contains(ev.target)) // clicked inside the dropdown.
			return
		if (e.picker.contains(ev.target)) // clicked inside the picker.
			return
		e.cancel()
	}

	// clicking outside the picker closes the picker, even if the click did something.
	function document_stopped_event(ev) {
		if (ev.type == 'mousedown')
			document_mousedown(ev)
	}

	function view_focusout(ev) {
		// prevent dropdown's focusout from bubbling to the parent when opening the picker.
		if (focusing_picker)
			return false
		e.fire('lost_focus') // grid editor protocol
	}

})

// ---------------------------------------------------------------------------
// listbox
// ---------------------------------------------------------------------------

listbox = component('x-listbox', function(e) {

	e.class('x-widget')
	e.class('x-listbox')
	e.class('x-focusable')
	e.attrval('tabindex', 0)

	e.init = function() {

		for (let item of e.items) {
			if (typeof(item) == 'string')
				item = {text: item}
			let item_div = H.div({class: 'x-listbox-item x-item'}, item.text)
			e.add(item_div)
			item_div.item = item
			item_div.on('mousedown', item_mousedown)
		}

	}

	// view

	// find the next item before/after the selected item that would need
	// scrolling, if the selected item would be on top/bottom of the viewport.
	function page_item(forward) {
		if (!e.selected_item)
			return forward ? e.first : e.last
		let item = e.selected_item
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

	// model

	e.late_property('selected_index', function() {
		return e.selected_item ? e.selected_item.index : null
	}, function(i) {
		select_item_by_index(i)
	})

	alias(e, 'value', 'selected_index') // picker protocol

	// controller

	e.attach = function() {
		if (e.selected_item)
			e.selected_item.make_visible()
	}

	e.on('keydown', list_keydown)
	e.on('keypress', list_keypress)

	function select_item_by_index(i, pick, from_input) {
		let item = null
		if (i != null) {
			i = clamp(i, 0, e.at.length-1)
			item = e.at[i]
		}
		return select_item(item, pick, from_input)
	}

	function select_item(item, pick, from_input) {
		if (item != e.selected_item) {
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
			e.fire('value_changed', item ? item.index : null, from_input)
		}
		if (pick)
			e.fire('value_picked', from_input) // picker protocol
	}

	function item_mousedown() {
		e.focus()
		select_item(this, true, true)
		return false
	}

	function list_keydown(key) {
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
			select_item_by_index(e.selected_index + d, false, true)
			return false
		}
		if (key == 'PageUp' || key == 'PageDown') {
			select_item(page_item(key == 'PageDown'), false, true)
			return false
		}
		if (key == 'Enter') {
			if (e.selected_item)
				e.fire('value_picked', true) // picker protocol
			return false
		}
	}

	// crude quick-search only for the first letter.
	let found_item
	function find_item(c, again) {
		if (e.selected_item != found_item)
			found_item = null // user changed selection, start over.
		let item = found_item && found_item.next || e.first
		while (item) {
			let s = item.item.text
			if (s.starts(c.toLowerCase()) || s.starts(c.toUpperCase())) {
				select_item(item, false, true)
				break
			}
			item = item.next
		}
		found_item = item
		if (!found_item && !again)
			find_item(c, true)
	}
	function list_keypress(c) {
		find_item(c)
	}

	// picker protocol

	e.property('display_value', function() {
		return e.selected_item ? e.selected_item.html : ''
	})

	e.pick_value = function(v, from_input) {
		select_item_by_index(v, true, from_input)
	}

	e.pick_near_value = function(delta) {
		select_item_by_index(e.selected_index + delta, true)
	}

	e.pick_next_value_starting_with = function(s) {
		find_item(s)
	}

})

// ---------------------------------------------------------------------------
// calendar
// ---------------------------------------------------------------------------

function month_names() {
	let a = []
	for (let i = 0; i <= 11; i++)
		a.push(month_name(utctime(0, i), 'short'))
	return a
}

calendar = component('x-calendar', function(e) {

	e.class('x-widget')
	e.class('x-calendar')
	e.class('x-focusable')
	e.attrval('tabindex', 0)

	e.format = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }

	e.sel_day = H.div({class: 'x-calendar-sel-day'})
	e.sel_day_suffix = H.div({class: 'x-calendar-sel-day-suffix'})
	e.sel_month = dropdown({
		classes: 'x-calendar-sel-month x-dropdown-nowrap',
		picker: listbox({
			items: month_names(),
		}),
	})
	e.sel_year = spin_input({
		classes: 'x-calendar-sel-year',
		min: 1000,
		max: 3000,
		button_style: 'left-right',
	})
	e.sel_month.on('value_changed', month_changed)
	e.sel_year.on('value_changed', year_changed)
	e.header = H.div({class: 'x-calendar-header'},
		e.sel_day, e.sel_day_suffix, e.sel_month, e.sel_year)
	e.weekview = H.table({class: 'x-calendar-weekview'})
	e.on('keydown', view_keydown)
	e.sel_month.on('keydown', sel_month_keydown)
	e.sel_year.on('keydown', sel_year_keydown)
	e.weekview.on('wheel', weekview_wheel)
	e.add(e.header, e.weekview)

	// model

	let value = day(0)
	e.late_property('value',
		function() {
			return value
		},
		function(t) {
			t = day(t)
			if (t != t) // NaN
				return
			if (t === value)
				return
			value = t
			this.fire('value_changed', t) // picker protocol
			update_view()
		}
	)

	// view

	function update_view() {
		let t = e.value
		update_weekview(t, 6)
		let y = year_of(t)
		let n = floor(1 + days(t - month(t)))
		e.sel_day.html = n
		let day_suffixes = ['', 'st', 'nd', 'rd']
		e.sel_day_suffix.html = locale.starts('en') ?
			(n < 11 || n > 13) && day_suffixes[n % 10] || 'th' : ''
		e.sel_month.value = month_of(t)
		e.sel_year.value = y
	}

	function update_weekview(d, weeks) {
		let today = day(now())
		let this_month = month(d)
		d = week(this_month)
		e.weekview.clear()
		for (let week = 0; week <= weeks; week++) {
			let tr = H.tr()
			for (let weekday = 0; weekday < 7; weekday++) {
				if (!week) {
					let th = H.th({class: 'x-calendar-weekday'}, weekday_name(day(d, weekday)))
					tr.add(th)
				} else {
					let m = month(d)
					let s = d == today ? ' today' : ''
					s = s + (m == this_month ? ' current-month' : '')
					s = s + (d == e.value ? ' focused selected' : '')
					let td = H.td({class: 'x-calendar-day x-item'+s}, floor(1 + days(d - m)))
					td.day = d
					td.on('mousedown', day_mousedown)
					tr.add(td)
					d = day(d, 1)
				}
			}
			e.weekview.add(tr)
		}
	}

	// controller

	e.attach = function() {
		update_view()
	}

	function day_mousedown() {
		e.value = this.day
		e.sel_month.cancel()
		e.focus()
		e.fire('value_picked', true) // picker protocol
		return false
	}

	function month_changed() {
		_d.setTime(e.value)
		_d.setMonth(this.value)
		e.value = _d.valueOf()
	}

	function year_changed() {
		_d.setTime(e.value)
		_d.setFullYear(this.value)
		e.value = _d.valueOf()
	}

	function weekview_wheel(dy) {
		e.value = day(e.value, 7 * dy / 100)
		return false
	}

	function view_keydown(key, shift) {
		if (!e.focused) // other inside element got focus
			return
		if (key == 'Tab' && e.hasclass('picker')) { // capture Tab navigation.
			if (shift)
				e.sel_year.focus()
			else
				e.sel_month.focus()
			return false
		}
		let d, m
		switch (key) {
			case 'ArrowLeft'  : d = -1; break
			case 'ArrowRight' : d =  1; break
			case 'ArrowUp'    : d = -7; break
			case 'ArrowDown'  : d =  7; break
			case 'PageUp'     : m = -1; break
			case 'PageDown'   : m =  1; break
		}
		if (d) {
			e.value = day(e.value, d)
			return false
		}
		if (m) {
			_d.setTime(e.value)
			if (shift)
				_d.setFullYear(year_of(e.value) + m)
			else
				_d.setMonth(month_of(e.value) + m)
			e.value = _d.valueOf()
			return false
		}
		if (key == 'Home') {
			e.value = shift ? year(e.value) : month(e.value)
			return false
		}
		if (key == 'End') {
			e.value = day(shift ? year(e.value, 1) : month(e.value, 1), -1)
			return false
		}
		if (key == 'Enter') {
			e.fire('value_picked', true) // picker protocol
			return false
		}
	}

	function sel_month_keydown(key, shift) {
		if (key == 'Tab' && e.hasclass('picker')) {// capture Tab navigation.
			if (shift)
				e.focus()
			else
				e.sel_year.focus()
			return false
		}
	}

	function sel_year_keydown(key, shift) {
		if (key == 'Tab' && e.hasclass('picker')) { // capture Tab navigation.
			if (shift)
				e.sel_month.focus()
			else
				e.focus()
			return false
		}
	}

	// picker protocol

	// hack: trick dropdown into thinking that our own opened dropdown picker
	// is our child, which is how we would implement dropdowns if this fucking
	// rendering model would allow us to decouple painting order from element's
	// position in the tree (IOW we need the concept of global z-index).
	let builtin_contains = e.contains
	e.contains = function(e1) {
		return builtin_contains.call(this, e1) || e.sel_month.picker.contains(e1)
	}

	e.property('display_value', function() {
		_d.setTime(e.value)
		return _d.toLocaleString(locale, e.format)
	})

	e.pick_value = function(v, from_input) {
		e.value = v
		e.fire('value_picked', from_input)
	}

	e.pick_near_value = function(delta, from_input) {
		e.value = day(e.value, delta)
		e.fire('value_picked', from_input)
	}

	e.pick_next_value_starting_with = function(s) {}

})

// ---------------------------------------------------------------------------
// menu
// ---------------------------------------------------------------------------

menu = component('x-menu', function(e) {

	// view

	function create_item(item) {
		let check_div = H.div({class: 'x-menu-check-div fa fa-check'})
		let icon_div  = H.div({class: 'x-menu-icon-div '+(item.icon_class || '')})
		let check_td  = H.td ({class: 'x-menu-check-td'}, check_div, icon_div)
		let title_td  = H.td ({class: 'x-menu-title-td'}, item.text)
		let key_td    = H.td ({class: 'x-menu-key-td'}, item.key)
		let sub_div   = H.div({class: 'x-menu-sub-div fa fa-caret-right'})
		let sub_td    = H.td ({class: 'x-menu-sub-td'}, sub_div)
		sub_div.style.visibility = item.items ? null : 'hidden'
		let tr = H.tr({class: 'x-item x-menu-tr'}, check_td, title_td, key_td, sub_td)
		tr.class('disabled', item.enabled == false)
		tr.item = item
		tr.check_div = check_div
		update_check(tr)
		tr.on('mousedown' , item_mousedown)
		tr.on('mouseenter', item_mouseenter)
		return tr
	}

	function create_separator() {
		let td = H.td({colspan: 5}, H.hr())
		let tr = H.tr({class: 'x-menu-separator-tr'}, td)
		tr.focusable = false
		return tr
	}

	function create_menu(items) {
		let table = H.table({class: 'x-focusable x-menu-table', tabindex: 0})
		for (let i = 0; i < items.length; i++) {
			let item = items[i]
			let tr = create_item(item)
			table.add(tr)
			if (item.separator)
				table.add(create_separator())
		}
		table.on('keydown', menu_keydown)
		return table
	}

	e.init = function() {
		e.table = create_menu(e.items)
		e.add(e.table)
	}

	function show_submenu(tr) {
		if (tr.submenu_table)
			return tr.submenu_table
		let items = tr.item.items
		if (!items)
			return
		let table = create_menu(items)
		table.x = tr.clientWidth - 2
		table.parent_menu = tr.parent
		tr.submenu_table = table
		tr.add(table)
		return table
	}

	function hide_submenu(tr, force) {
		if (!tr.submenu_table)
			return
		tr.submenu_table.remove()
		tr.submenu_table = null
	}

	function select_item(menu, tr) {
		unselect_selected_item(menu)
		menu.selected_item_tr = tr
		if (tr)
			tr.class('focused', true)
	}

	function unselect_selected_item(menu) {
		let tr = menu.selected_item_tr
		if (!tr)
			return
		menu.selected_item_tr = null
		hide_submenu(tr)
		tr.class('focused', false)
	}

	function update_check(tr) {
		tr.check_div.style.display = tr.item.checked != null ? null : 'none'
		tr.check_div.style.visibility = tr.item.checked ? null : 'hidden'
	}

	// popup protocol

	e.popup_target_attached = function(target) {
		document.on('mousedown', e.close)
	}

	e.popup_target_detached = function(target) {
		document.off('mousedown', e.close)
	}

	let popup_target

	e.close = function(focus_target) {
		let target = popup_target
		e.popup(false)
		select_item(e.table, null)
		if (target && focus_target)
			target.focus()
	}

	e.override('popup', function(inherited, target, side, align, x, y, select_first_item) {
		popup_target = target
		inherited.call(this, target, side, align, x, y)
		if (select_first_item)
			select_next_item(e.table)
		e.table.focus()
	})

	// navigation

	function next_item(menu, down, tr) {
		tr = tr && (down ? tr.next : tr.prev)
		return tr || (down ? menu.first : menu.last)
	}
	function next_valid_item(menu, down, tr, enabled) {
		let i = menu.children.length
		while (i--) {
			tr = next_item(menu, down != false, tr)
			if (tr && tr.focusable != false && (!enabled || tr.enabled != false))
				return tr
		}
	}
	function select_next_item(menu, down, tr0, enabled) {
		select_item(menu, next_valid_item(menu, down, tr0, enabled))
	}

	function activate_submenu(tr) {
		let submenu = show_submenu(tr)
		if (!submenu)
			return
		submenu.focus()
		select_next_item(submenu)
		return true
	}

	function click_item(tr, allow_close, from_keyboard) {
		let item = tr.item
		if ((item.action || item.checked != null) && item.enabled != false) {
			if (item.checked != null) {
				item.checked = !item.checked
				update_check(tr)
			}
			if (!item.action || item.action(item) != false)
				if (allow_close != false)
					e.close(from_keyboard)
		}
	}

	// mouse bindings

	function item_mousedown() {
		click_item(this)
		return false
	}

	function item_mouseenter(ev) {
		if (this.submenu_table)
			return // mouse entered on the submenu.
		this.parent.focus()
		select_item(this.parent, this)
		show_submenu(this)
	}

	// keyboard binding

	function menu_keydown(key) {
		if (key == 'ArrowUp' || key == 'ArrowDown') {
			select_next_item(this, key == 'ArrowDown', this.selected_item_tr)
			return false
		}
		if (key == 'ArrowRight') {
			if (this.selected_item_tr)
				activate_submenu(this.selected_item_tr)
			return false
		}
		if (key == 'ArrowLeft') {
			if (this.parent_menu) {
				this.parent_menu.focus()
				hide_submenu(this.parent)
			}
			return false
		}
		if (key == 'Home' || key == 'End') {
			select_next_item(this, key == 'Home')
			return false
		}
		if (key == 'PageUp' || key == 'PageDown') {
			select_next_item(this, key == 'PageUp')
			return false
		}
		if (key == 'Enter' || key == ' ') {
			let tr = this.selected_item_tr
			if (tr) {
				let submenu_activated = activate_submenu(tr)
				click_item(tr, !submenu_activated, true)
			}
			return false
		}
		if (key == 'Escape') {
			if (this.parent_menu) {
				this.parent_menu.focus()
				hide_submenu(this.parent)
			} else
				e.close(true)
			return false
		}
	}

})

// ---------------------------------------------------------------------------
// pagelist
// ---------------------------------------------------------------------------

pagelist = component('x-pagelist', function(e) {

	e.class('x-widget')
	e.class('x-pagelist')

	e.init = function() {
		if (e.items)
			for (let i = 0; i < e.items.length; i++) {
				let item = e.items[i]
				if (typeof(item) == 'string')
					item = {text: item}
				let item_div = H.div({class: 'x-pagelist-item', tabindex: 0}, item.text)
				item_div.on('mousedown', item_mousedown)
				item_div.on('keydown'  , item_keydown)
				item_div.item = item
				item_div.index = i
				e.add(item_div)
			}
		e.selection_bar = H.div({class: 'x-pagelist-selection-bar'})
		e.add(e.selection_bar)
	}

	// controller

	e.attach = function() {
		e.selected_index = e.selected_index
	}

	function select_item(idiv) {
		if (e.selected_item) {
			e.selected_item.class('selected', false)
			e.fire('close', e.selected_item.index)
			if (e.page_container)
				e.page_container.clear()
		}
		e.selection_bar.style.display = idiv ? null : 'none'
		e.selected_item = idiv
		if (idiv) {
			idiv.class('selected', true)
			e.selection_bar.x = idiv.offsetLeft
			e.selection_bar.w = idiv.clientWidth
			e.fire('open', idiv.index)
			if (e.page_container) {
				let page = idiv.item.page
				if (page) {
					e.page_container.add(page)
					let first_focusable = page.focusables()[0]
					if (first_focusable)
						first_focusable.focus()
				}
			}
		}
	}

	function item_mousedown() {
		this.focus()
		select_item(this)
		return false
	}

	function item_keydown(key) {
		if (key == ' ' || key == 'Enter') {
			select_item(this)
			return false
		}
		if (key == 'ArrowRight' || key == 'ArrowLeft') {
			e.selected_index += (key == 'ArrowRight' ? 1 : -1)
			if (e.selected_item)
				e.selected_item.focus()
			return false
		}
	}

	// selected_index property.

	e.late_property('selected_index',
		function() {
			return e.selected_item ? e.selected_item.index : null
		},
		function(i) {
			let idiv = e.at[clamp(i, 0, e.children.length-2)]
			if (!idiv)
				return
			select_item(idiv)
		}
	)

})

// ---------------------------------------------------------------------------
// split-view
// ---------------------------------------------------------------------------

vsplit = component('x-split', function(e) {

	e.class('x-widget')
	e.class('x-split')

	let horiz, left, fixed_pane, auto_pane

	e.init = function() {

		horiz = e.horizontal == true

		// check which pane is the one with a fixed width.
		let fixed_pi =
			((e[1].style[horiz ? 'width' : 'height'] || '').ends('px') && 1) ||
			((e[2].style[horiz ? 'width' : 'height'] || '').ends('px') && 2) || 1
		e.fixed_pane = e[  fixed_pi]
		e. auto_pane = e[3-fixed_pi]
		left = fixed_pi == 1

		e.class('horizontal',  horiz)
		e.class(  'vertical', !horiz)
		e[1].class('x-split-pane', true)
		e[2].class('x-split-pane', true)
		e.fixed_pane.class('x-split-pane-fixed')
		e. auto_pane.class('x-split-pane-auto')
		e.sizer = H.div({class: 'x-split-sizer'})
		e.add(e[1], e.sizer, e[2])

		e.class('resizeable', e.resizeable != false)
		if (e.resizeable == false)
			e.sizer.hide()
	}

	e.on('mousemove', view_mousemove)
	e.on('mousedown', view_mousedown)

	e.detach = function() {
		document_mouseup()
	}

	// controller

	let hit, hit_x, mx0, w0, resist

	function view_mousemove(rmx, rmy) {
		if (window.split_resizing)
			return
		// hit-test for split resizing.
		hit = false
		if (e.client_rect().contains(rmx, rmy)) {
			// ^^ mouse is not over some scrollbar.
			let mx = horiz ? rmx : rmy
			let sr = e.sizer.client_rect()
			let sx1 = horiz ? sr.left  : sr.top
			let sx2 = horiz ? sr.right : sr.bottom
			w0 = e.fixed_pane.client_rect()[horiz ? 'width' : 'height']
			hit_x = mx - sx1
			hit = abs(hit_x - (sx2 - sx1) / 2) <= 5
			resist = true
			mx0 = mx
		}
		e.class('resize', hit)
	}

	function view_mousedown() {
		if (!hit)
			return
		e.class('resizing')
		window.split_resizing = true // view_mousemove barrier.
		document.on('mousemove', document_mousemove)
		document.on('mouseup'  , document_mouseup)
	}

	function document_mousemove(rmx, rmy) {

		let mx = horiz ? rmx : rmy
		let w
		if (left) {
			let fpx1 = e.fixed_pane.client_rect()[horiz ? 'left' : 'top']
			w = mx - (fpx1 + hit_x)
		} else {
			let ex2 = e.client_rect()[horiz ? 'right' : 'bottom']
			let sw = e.sizer[horiz ? 'clientWidth' : 'clientHeight']
			w = ex2 - mx + hit_x - sw
		}

		resist = resist && abs(mx - mx0) < 20
		if (resist)
			w = w0 + (w - w0) * .2 // show resistance

		e.fixed_pane[horiz ? 'w' : 'h'] = w

		if (e.collapsable != false) {
			let w1 = e.fixed_pane.client_rect()[horiz ? 'width' : 'height']

			let pminw = e.fixed_pane.style[horiz ? 'min-width' : 'min-height']
			pminw = pminw ? parseInt(pminw) : 0

			if (!e.fixed_pane.hasclass('collapsed')) {
				if (w < min(max(pminw, 20), 30) - 5)
					e.fixed_pane.class('collapsed', true)
			} else {
				if (w > max(pminw, 30))
					e.fixed_pane.class('collapsed', false)
			}
		}

		return false
	}

	function document_mouseup() {
		if (resist) // reset width
			e[1][horiz ? 'w' : 'h'] = w0
		e.class('resizing', false)
		window.split_resizing = null
		document.off('mousemove', document_mousemove)
		document.off('mouseup'  , document_mouseup)
	}

})

function hsplit(...args) {
	return vsplit({horizontal: true}, ...args)
}

// ---------------------------------------------------------------------------
// grid
// ---------------------------------------------------------------------------

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
		if (e.pick_value_col)
			e.pick_value_field = e.rowset.field(e.pick_value_col)
		if (e.pick_display_col)
			e.pick_display_field = e.rowset.field(e.pick_display_col)
		else
			e.pick_display_field = e.pick_value_field
	}

	function field_w(field, w) {
		return max(e.min_col_w, clamp(or(w, field.w), field.min_w || -1/0, field.max_w || 1/0))
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

	function can_focus_cell(row, field, for_editing) {
		return (field == null || e.can_focus_cells)
			&& e.rowset.can_focus_cell(row.row, field)
			&& (!for_editing || can_change_value(row, field))
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

	e.scroll_to_cell = function(cell) {
		let [ri, fi] = cell
		if (ri == null)
			return
		let view = e.rows_view_div
		let th = fi != null && e.header_tr.at[fi]
		let h = e.row_h
		let y = h * ri
		let x = th ? th.offsetLeft  : 0
		let w = th ? th.clientWidth : 0
		view.scroll_to_view_rect(null, null, x, y, w, h)
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
		if (e.picker_h != null && e.picker_max_h != null) {
			e.h = 0 // compute e.offsetHeight with 0 clientHeight. relayouting...
			e.h = max(e.picker_h, min(e.rows_h, e.picker_max_h)) + e.offsetHeight
		}
		e.rows_view_h = e.clientHeight - e.header_table.clientHeight
		e.rows_div.h = e.rows_h
		e.rows_view_div.h = e.rows_view_h
		e.visible_row_count = floor(e.rows_view_h / e.row_h) + 2
		e.page_row_count = floor(e.rows_view_h / e.row_h)
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

		e.on('mousemove'    , view_mousemove)
		e.on('keydown'      , view_keydown)
		e.on('keypress'     , view_keypress)
		e.on('attr_changed' , view_attr_changed)

		e.rows_view_div.on('scroll', update_view)
	}

	// when: fields changed.
	function update_header_table() {
		set_header_visibility()
		e.header_table.clear()
		for (let field of e.fields) {

			let sort_icon     = H.span({class: 'fa x-grid-sort-icon'})
			let sort_icon_pri = H.span({class: 'x-grid-header-sort-icon-pri'})
			let e1 = H.td({class: 'x-grid-header-title-td'}, H(field.text) || field.name)
			let e2 = H.td({class: 'x-grid-header-sort-icon-td'}, sort_icon, sort_icon_pri)
			if (field.align == 'right')
				[e1, e2] = [e2, e1]
			e1.attr('align', 'left')
			e2.attr('align', 'right')
			let title_table =
				H.table({class: 'x-grid-header-th-table'},
					H.tr(0, e1, e2))

			let th = H.th({class: 'x-grid-header-th'}, title_table)

			th.field = field
			th.sort_icon = sort_icon
			th.sort_icon_pri = sort_icon_pri

			th.w = field_w(field)
			th.style['border-right-width' ] = e.row_border_w + 'px'

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
			let tr = H.tr({class: 'x-grid-tr'})
			for (let i = 0; i < e.fields.length; i++) {
				let th = e.header_tr.at[i]
				let field = e.fields[i]
				let td = H.td({class: 'x-grid-td'})
				td.w = field_w(field)
				td.h = e.row_h
				td.style['border-right-width' ] = e.row_border_w + 'px'
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
	let cw, ch
	function view_attr_changed() {
		if (e.clientWidth === cw && e.clientHeight === ch)
			return
		if (e.clientHeight !== ch) {
			let vrc = e.visible_row_count
			update_heights()
			if (e.visible_row_count != vrc) {
				update_rows_table()
				update_view()
			}
		}
		cw = e.clientWidth
		ch = e.clientHeight
	}

	// when: scroll_y changed.
	function update_row(tr, ri) {
		let row = e.rows[ri]
		tr.row = row
		tr.row_index = ri
		if (row)
			tr.class('x-item', can_focus_cell(row))
		for (let fi = 0; fi < e.fields.length; fi++) {
			let field = e.fields[fi]
			let td = tr.at[fi]
			td.field = field
			td.field_index = fi
			if (row) {
				td.html = e.rowset.display_value(row.row, field)
				td.class('x-item', can_focus_cell(row, field))
				td.class('disabled',
					e.can_focus_cells
					&& e.can_edit
					&& e.rowset.can_edit
					&& e.rowset.can_change_rows
					&& !can_focus_cell(row, field, true))
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
			th.sort_icon.class('fa-sort'             , false)
			th.sort_icon.class('fa-angle-up'         , false)
			th.sort_icon.class('fa-angle-double-up'  , false)
			th.sort_icon.class('fa-angle-down'       , false)
			th.sort_icon.class('fa-angle-double-down', false)
			th.sort_icon.class('fa-angle'+(pri ? '-double' : '')+'-up'  , dir == 'asc')
			th.sort_icon.class('fa-angle'+(pri ? '-double' : '')+'-down', dir == 'desc')
			th.sort_icon_pri.html = pri > 1 ? pri : ''
		}
	}

	function update_focus(set) {
		let [tr, td] = tr_td_at(e.focused_cell)
		if (tr) { tr.class('focused', set); tr.class('editing', e.input && set || false); }
		if (td) { td.class('focused', set); td.class('editing', e.input && set || false); }
	}

	// when: input created, heights changed, column width changed.
	function update_input_geometry() {
		if (!e.input)
			return
		let [ri, fi] = e.focused_cell
		let th = e.header_tr.at[fi]
		let fix = floor(e.row_border_h / 2 + (window.chrome ? .5 : 0))
		e.input.x = th.offsetLeft + th.clientLeft
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

	function create_editor(editor_state) {
		let [row, field] = row_field_at(e.focused_cell)
		let [_, td] = tr_td_at(e.focused_cell)
		update_focus(false)

		e.input = d.create_editor(row, field)
		e.input.value = e.rowset.value(row.row, field)

		e.input.class('grid-editor')

		if (e.input.enter_editor)
			e.input.enter_editor(editor_state)

		e.input.on('value_changed', input_value_changed)
		e.input.on('lost_focus', editor_lost_focus)

		e.rows_div.add(e.input)
		update_input_geometry()
		if (td)
			td.html = null
		update_focus(true)
	}

	function free_editor() {
		let input = e.input
		let [row, field] = row_field_at(e.focused_cell)
		let [tr, td] = tr_td_at(e.focused_cell)
		update_focus(false)
		e.input = null // clear it before removing it for input_focusout!
		e.rows_div.removeChild(input)
		if (td)
			td.html = e.rowset.display_value(row.row, field)
		update_focus(true)
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

	let picker_forced_options = {can_edit: 1, can_focus_cells: 1, picker_h: 1, picker_max_h: 1}

	function set_picker_options() {
		let as_picker = e.hasclass('picker')
		if (!as_picker)
			return
		e._saved = {}
		copy_keys(e._saved, e, picker_forced_options)
		e.can_edit        = false
		e.can_focus_cells = false
		e.picker_h     = or(e.picker_h    , 0)
		e.picker_max_h = or(e.picker_max_h, 200)
	}

	function unset_picker_options() {
		if (!e._saved)
			return
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
		e.focus_cell(null, 0, 0, {force: true})
	}

	e.detach = function() {
		hook_unhook_events(false)
		unset_picker_options()
	}

	// focusing ---------------------------------------------------------------

	e.focused_cell = [null, null]

	e.first_focusable_cell = function(cell, rows, cols, options) {

		cell = or(cell, e.focused_cell) // null cell means focused cell.
		rows = or(rows, 0) // by default find the first focusable row.
		cols = or(cols, 0) // by default find the first focusable col.

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
		ri = or(ri, ri_inc * -1/0)
		fi = or(fi, fi_inc * -1/0)

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
		} else if (!(options && options.force))
			return true // same cell.

		update_focus(false)
		let row_changed = e.focused_cell[0] != cell[0]
		e.focused_cell = cell
		update_focus(true)
		if (!options || options.make_visible != false)
			e.scroll_to_cell(cell)

		if (e.pick_value_field)
			e.fire('value_changed', e.value, true)

		if (row_changed) { // rowset_nav protocol
			let [row] = row_field_at(e.focused_cell)
			e.fire('row_changed', row.row)
		}

		return true
	}

	e.focus_next_cell = function(cols, auto_advance_row, for_editing) {
		let dir = strict_sign(cols)
		return e.focus_cell(null, dir * 0, cols, {must_move: true, for_editing: for_editing})
			|| ((auto_advance_row || e.auto_advance_row)
				&& e.focus_cell(null, dir, dir * -1/0, {for_editing: for_editing}))
	}

	function on_last_row() {
		let [ri] = e.first_focusable_cell(null, 1, 0, {must_move: true})
		return ri == null
	}

	function focused_row() {
		let [ri] = e.focused_cell
		return ri != null ? e.rows[ri] : null
	}

	function editor_lost_focus(ev) {
		if (!e.input) // input is being removed.
			return
		if (ev.target != e.input) // other input that bubbled up.
			return
		e.exit_edit()
	}

	// editing ----------------------------------------------------------------

	e.input = null

	function input_value_changed(v) {
		if (e.save_cell_on == 'input')
			e.save_cell(e.focused_cell)
	}

	function td_input(td) {
		return td.first
	}

	e.enter_edit = function(editor_state) {
		if (e.input)
			return
		let [row, field] = row_field_at(e.focused_cell)
		if (!can_focus_cell(row, field, true))
			return
		create_editor(editor_state)
		e.input.focus()
	}

	e.exit_edit = function() {
		if (!e.input)
			return true

		if (e.save_cell_on == 'exit_edit')
			e.save_cell(e.focused_cell)
		if (e.save_row_on == 'exit_edit')
			e.save_row(e.focused_cell)

		/*
		if (e.prevent_exit_edit)
			if (e.focused_td.hasclass('invalid'))
				return false
		*/

		let had_focus = e.hasfocus
		free_editor()
		if (had_focus)
			e.focus()

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

	function cell_metadata(cell) {
		let [row, field] = row_field_at(cell)
		return attr(array_attr(row, 'metadata'), field.index)
	}

	e.save_cell = function(cell) {
		let t = cell_metadata(cell)
		let [row, field] = row_field_at(cell)
		let ret = e.rowset.set_value(row.row, field, e.input.value, g)
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
		let t = cell_metadata(cell)
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
			e.scroll_to_cell(e.focused_cell)
			if (reenter_edit)
				e.enter_edit('select_all')
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
		e.focus()
		e.toggle_order(this.field, ev.shiftKey)
		return false
	}

	function header_cell_rightmousedown(ev) {
		if (e.hasclass('col-resize'))
			return
		e.focus()
		if (ev.shiftKey) {
			field_context_menu_popup(ev.target, this.field)
			return false
		}
		e.clear_order()
		return false
	}

	function cell_mousedown() {
		if (e.hasclass('col-resize'))
			return
		let had_focus = e.hasfocus
		if (!had_focus)
			e.focus()
		let ri = this.parent.row_index
		let fi = this.field_index
		if (e.focused_cell[0] == ri && e.focused_cell[1] == fi) {
			if (had_focus) {
				// TODO: what we want here is `e.enter_edit()` without `return false`
				// to let mousedown click-through to the input box and focus the input
				// and move the caret under the mouse all by itself.
				// Unfortunately, this only works in Chrome no luck with Firefox.
				e.enter_edit('select_all')
				return false
			}
		} else {
			e.focus_cell([ri, fi], 0, 0, {must_not_move_row: true})
			e.fire('value_picked', true) // picker protocol.
			return false
		}
	}

	// make columns resizeable ------------------------------------------------

	let hit_th, hit_x

	function document_mousedown() {
		if (window.grid_col_resizing || !hit_th)
			return
		e.focus()
		window.grid_col_resizing = true
		e.class('col-resizing')
	}

	function document_mouseup() {
		window.grid_col_resizing = false
		e.class('col-resizing', false)
	}

	function view_mousemove(mx, my, ev) {
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
		field.w = field_w(field, w)
		hit_th.w = field.w
		update_col_width(hit_th.index, hit_th.clientWidth)
		update_input_geometry()
		return false
	}

	// keyboard bindings ------------------------------------------------------

	function view_keydown(key, shift) {

		// Arrows: horizontal navigation.
		if (key == 'ArrowLeft' || key == 'ArrowRight') {

			let cols = key == 'ArrowLeft' ? -1 : 1

			let reenter_edit = e.input && e.keep_editing

			let move = !e.input
				|| (e.auto_jump_cells && !shift
					&& (!e.input.editor_state
						|| e.input.editor_state(cols < 0 ? 'left' : 'right')))

			if (move && e.focus_next_cell(cols, null, reenter_edit)) {
				if (reenter_edit)
					e.enter_edit(cols > 0 ? 'left' : 'right')
				return false
			}
		}

		// Tab/Shift+Tab cell navigation.
		if (key == 'Tab' && e.tab_navigation) {

			let cols = shift ? -1 : 1

			let reenter_edit = e.input && e.keep_editing

			if (e.focus_next_cell(cols, true, reenter_edit))
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
				case 'PageUp'    : rows = -e.page_row_count; break
				case 'PageDown'  : rows =  e.page_row_count; break
				case 'Home'      : rows = -1/0; break
				case 'End'       : rows =  1/0; break
			}

			let reenter_edit = e.input && e.keep_editing
			let editor_state = e.input
				&& e.input.editor_state && e.input.editor_state()

			if (e.focus_cell(null, rows)) {
				if (reenter_edit)
					e.enter_edit(editor_state)
				return false
			}
		}

		// F2: enter edit mode
		if (!e.input && key == 'F2') {
			e.enter_edit('select_all')
			return false
		}

		// Enter: toggle edit mode, and navigate on exit
		if (key == 'Enter') {
			if (e.hasclass('picker')) {
				e.fire('value_picked', true)
			} else if (!e.input) {
				e.enter_edit('select_all')
			} else if (e.exit_edit()) {
				if (e.auto_advance == 'next_row') {
					if (e.focus_cell(null, 1))
						if (e.keep_editing)
							e.enter_edit('select_all')
				} else if (e.auto_advance == 'next_cell')
					if (e.focus_next_cell(shift ? -1 : 1, null, e.keep_editing))
						if (e.keep_editing)
							e.enter_edit('select_all')
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

	// printable characters: enter quick edit mode.
	function view_keypress() {
		if (!e.input) {
			e.enter_edit('select_all')
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
				if (field && field.sortable) {
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
		if (!field.sortable)
			return
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
		e.scroll_to_cell(e.focused_cell)

	}

	// columns context menu ---------------------------------------------------

	function field_context_menu_popup(th, field) {
		if (th.menu)
			th.menu.close()
		function toggle_field(item) {
			return false
		}
		let items = []
		for (let field of e.rowset.fields) {
			items.push({field: field, text: field.name, checked: true, click: toggle_field})
		}
		th.menu = menu({items: items})
		th.menu.popup(th)
	}

	// picker protocol --------------------------------------------------------

	e.property('value',
		function() {
			let [row] = row_field_at(e.focused_cell)
			return row ? e.rowset.value(row.row, e.pick_value_field) : null
		},
		function(v) {
			e.pick_value(v)
		}
	)

	e.property('display_value', function() {
		let [row] = row_field_at(e.focused_cell)
		return row ? e.rowset.display_value(row.row, e.pick_display_field) : ''
	})

	e.pick_value = function(v, from_input) {
		let field = e.pick_value_field
		let ri = find_row(field, v)
		if (ri == null)
			return // TODO: deselect
		if (e.focus_cell([ri, field.index]))
			e.fire('value_picked', from_input) // picker protocol.
	}

	e.pick_near_value = function(delta, from_input) {
		let field = e.pick_value_field
		if (e.focus_cell(e.focused_cell, delta))
			e.fire('value_picked', from_input)
	}

	e.pick_next_value_starting_with = function(s) {
		// TODO:
	}


})

