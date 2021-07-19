/*

	Model-driven single-value input widgets.
	Written by Cosmin Apreutesei. Public Domain.

	Widgets:

		checkbox
		radiogroup
		editbox
		passedit
		spinedit
		tagsedit
		placeedit
		googlemaps
		slider
		dropdown
		calendar
		date_dropdown
		richtext
		image
		sql_editor
		chart
		input
		form

*/

/* ---------------------------------------------------------------------------
// row widget mixin
// ---------------------------------------------------------------------------
publishes:
	e.nav
	e.nav_id
	e.row
implements:
	do_update
calls:
	do_update_row([row])
--------------------------------------------------------------------------- */

function row_widget(e, enabled_without_nav) {

	selectable_widget(e)
	contained_widget(e)
	serializable_widget(e)

	e.isinput = true // auto-focused when pagelist items are changed.

	e.do_update = function() {
		let row = e.row
		e.disabled = !(enabled_without_nav || row)
		e.do_update_row(row)
	}

	function row_changed() {
		e.update()
	}

	function bind_nav(nav, on) {
		if (!e.bound)
			return
		if (!nav)
			return
		nav.on('focused_row_changed', row_changed, on)
		nav.on('focused_row_state_changed', row_changed, on)
		nav.on('focused_row_cell_state_changed', row_changed, on)
		nav.on('display_vals_changed', row_changed, on)
		nav.on('reset', row_changed, on)
		nav.on('col_text_changed', row_changed, on)
		nav.on('col_info_changed', row_changed, on)
	}

	e.set_nav = function(nav1, nav0) {
		assert(nav1 != e)
		bind_nav(nav0, false)
		bind_nav(nav1, true)
	}
	e.prop('nav', {store: 'var', private: true})
	e.prop('nav_id', {store: 'var', bind_id: 'nav', type: 'nav', attr: true})

	e.property('row', () => e.nav && e.nav.focused_row)

}

/* ---------------------------------------------------------------------------
// val widget mixin
// ---------------------------------------------------------------------------
publishes:
	e.nav
	e.nav_id
	e.col
	e.field
	e.row
	e.val
	e.input_val
	e.error
	e.modified
	e.set_val(v, ev)
	e.reset_val(v, ev)
	e.display_val_for()
implements:
	e.do_update([opt])
calls:
	e.do_update_val(val, ev)
	e.do_update_errors(errors, ev)
	e.do_error_tooltip_check()
	e.to_val(v) -> v
	e.from_val(v) -> v
--------------------------------------------------------------------------- */

function val_widget(e, enabled_without_nav, show_error_tooltip) {

	selectable_widget(e)
	contained_widget(e)
	serializable_widget(e)

	e.isinput = true // auto-focused when pagelist items are changed.

	// nav dynamic binding ----------------------------------------------------

	function bind_field(on) {
		assert(!(on && !e.bound))
		assert(e.owns_field != null) // can't call this before init().
		let field0 = e.field
		let field1 = on && e.nav && e.nav.all_fields[e.col] || null
		if (field0 == field1)
			return
		if (field0)
			e.fire('bind_field', false)
		e.field = field1
		if (field1)
			e.fire('bind_field', true)
	}

	function val_changed() {
		bind_field(true)
		e.update()
	}

	function nav_reset() {
		bind_field(true)
		e.update()
	}

	function col_attr_changed() {
		e.update()
	}

	e.do_update_val = noop

	function cell_state_changed(field, key, val, ev) {
		if (e.updating)
			return
		bind_field(true)
		if (key == 'input_val')
			e.do_update_val(val, ev)
		else if (key == 'val')
			e.fire('val_changed', val, ev)
		else if (key == 'errors') {
			e.invalid = val != null && !val.passed
			e.class('invalid', e.invalid)
			e.do_update_errors(val, ev)
		} else if (key == 'modified')
			e.class('modified', val)
	}

	function bind_nav(nav, col, on) {
		if (on && !e.bound)
			return
		if (!(nav && col != null))
			return
		nav.on('focused_row_changed', val_changed, on)
		nav.on('focused_row_cell_state_changed_for_'+col, cell_state_changed, on)
		nav.on('display_vals_changed_for_'+col, val_changed, on)
		nav.on('reset', nav_reset, on)
		nav.on('col_text_changed_for_'+col, col_attr_changed, on)
		nav.on('col_info_changed_for_'+col, col_attr_changed, on)
		bind_field(on)
	}

	let field_opt
	let init = e.init
	e.init = function() {
		if (e.field) {
			// `field` option enables standalone mode.
			field_opt = e.field
			field_opt.type = or(field_opt.type, e.field_type)
			e.owns_field = true
		} else {
			e.owns_field = false
		}
		init()
	}

	e.on('bind', function val_widget_bind(on) {
		if (e.owns_field) {
			if (on) {
				let nav = global_val_nav()
				let field = nav.add_field(field_opt)
				if (initial_val !== undefined)
					nav.reset_cell_val(nav.all_rows[0], field, initial_val, {validate: true})
				initial_val = undefined
				e.nav = nav
				e.col = field.name
			} else {
				let nav = e.nav
				let field = e.field
				e.nav = null
				e.col = null
				nav.remove_field(field)
			}
		} else {
			bind_nav(e.nav, e.col, on)
		}
	})

	function set_nav_col(nav1, nav0, col1, col0) {
		bind_nav(nav0, col0, false)
		bind_nav(nav1, col1, true)
	}

	e.set_nav = function(nav1, nav0) {
		assert(nav1 != e)
		set_nav_col(nav1, nav0, e.col, e.col)
	}
	e.prop('nav', {store: 'var', private: true})
	e.prop('nav_id' , {store: 'var', bind_id: 'nav', type: 'nav'})

	e.set_col = function(col1, col0) {
		set_nav_col(e.nav, e.nav, col1, col0)
	}
	e.prop('col', {store: 'var', type: 'col', col_nav: () => e.nav})

	// model ------------------------------------------------------------------

	e.to_val = function(v) { return v; }
	e.from_val = function(v) { return v; }

	e.property('row', () => e.nav && e.nav.focused_row)

	function get_val() {
		let row = e.row
		return e.field && row ? e.nav.cell_val(row, e.field) : null
	}
	let initial_val
	e.set_val = function(v, ev) {
		v = e.to_val(v)
		if (v === undefined)
			v = null
		if (e.nav && e.field)
			e.nav.set_cell_val(e.row, e.field, v, ev)
		else
			initial_val = v
	}
	e.property('val', get_val, e.set_val)

	e.reset_val = function(v, ev) {
		v = e.to_val(v)
		if (v === undefined)
			v = null
		if (e.row && e.field)
			e.nav.reset_cell_val(e.row, e.field, v, ev)
	}

	e.property('input_val', function() {
		let row = e.row
		return row && e.field ? e.from_val(e.nav.cell_input_val(e.row, e.field)) : null
	})

	e.property('errors', function() {
		let row = e.row
		return row && e.field ? e.nav.cell_errors(row, e.field) : undefined
	})

	e.property('modified', function() {
		let row = e.row
		return row && e.field ? e.nav.cell_modified(row, e.field) : false
	})

	e.placeholder_display_val = function() {
		return div({class: 'x-input-placeholder'})
	}

	e.display_val_for = function(v) {
		if (!e.row || !e.field)
			return e.placeholder_display_val()
		return e.nav.cell_display_val_for(e.row, e.field, v)
	}

	// view -------------------------------------------------------------------

	e.do_update = function() {
		let disabled = !(enabled_without_nav || (e.row && e.field))
		e.bool_attr('disabled', disabled || null) // for non-focusables
		e.disabled = disabled
		cell_state_changed(e.field, 'input_val', e.input_val)
		cell_state_changed(e.field, 'val', e.val)
		cell_state_changed(e.field, 'errors', e.errors)
		cell_state_changed(e.field, 'modified', e.modified)
	}

	e.do_error_tooltip_check = function() {
		return e.invalid && !e.hasclass('picker')
			&& (e.hasfocus || e.hovered)
	}

	e.do_update_errors = function(errors) {
		if (show_error_tooltip === false)
			return
		if (!e.error_tooltip) {
			if (!e.invalid)
				return // don't create it until needed.
			e.error_tooltip = tooltip({kind: 'error', target: e,
				check: e.do_error_tooltip_check})
		}
		if (e.invalid) {
			let errs = errors.filter(err => !err.passed).map(err => err.message)
			e.error_tooltip.text = errs.length > 1 ? tag('ul', {style: 'text-align: start'}, ...errs.map(s => tag('li', 0, s))) : errs
		}
		e.error_tooltip.update()
	}

}

// ---------------------------------------------------------------------------
// input widget mixin
// ---------------------------------------------------------------------------

function input_widget(e) {

	e.prop('label'   , {store: 'var', slot: 'lang'})
	e.prop('nolabel' , {store: 'var', type: 'bool'})
	e.prop('align'   , {store: 'var', type: 'enum', enum_values: ['left', 'right'], default: 'left', attr: true})
	e.prop('mode'    , {store: 'var', type: 'enum', enum_values: ['default', 'inline'], default: 'default', attr: true})
	e.prop('info'    , {store: 'var', slot: 'lang'})
	e.prop('infomode', {store: 'var', slot: 'lang', type: 'enum', enum_values: ['under', 'button', 'hidden'], attr: true, default: 'under'})

	e.add_info_button = e.add // stub
	e.add_info_box = e.add // stub

	function update_info() {
		let info = e.field && e.field.info

		if (info && e.infomode == 'button' && !e.info_button) {
			e.info_button = button({
				classes: 'x-input-info-button',
				icon: 'fa fa-info-circle',
				text: '',
				focusable: false,
			})
			e.info_tooltip = tooltip({
				kind: 'info',
				side: 'bottom',
				align: 'end',
			})
			e.info_tooltip.on('click', function() {
				this.close()
			})
			e.info_button.action = function() {
				if (e.info_tooltip.target) {
					e.info_tooltip.target = null
				} else {
					e.info_tooltip.target = e.info_button
				}
			}
			e.add_info_button(e.info_button)
		}
		if (e.info_button) {
			e.info_tooltip.text = info
			e.info_button.show(e.infomode == 'button' && !!info)
		}

		if (info && e.infomode == 'under' && !e.info_box) {
			e.info_box = div({class: 'x-input-info'})
			e.add_info_box(e.info_box)
		}
		if (e.info_box) {
			e.info_box.set(info)
			e.info_box.show(e.infomode == 'under' && !!info)
		}

	}

	e.label_placeholder = function() {
		return div({class: 'x-input-placeholder'})
	}

	e.do_after('do_update', function() {
		update_info()
		let s = !e.nolabel && (e.label || (e.field && e.field.text)) || null
		e.class('with-label', !!s)
		e.label_box.set(!e.nolabel ? s || e.label_placeholder() : null)
	})

	e.on('keydown', function(key) {
		if (key == 'F1') {
			if (e.info_button)
				e.info_button.activate()
			return false
		}
	})

	e.on('mousedown', function(ev) {
		let fe = e.focusables()[0]
		if (fe && ev.target != fe) {
			fe.focus()
			return false
		}
	})

}

// ---------------------------------------------------------------------------
// checkbox
// ---------------------------------------------------------------------------

component('x-checkbox', 'Input', function(e) {

	focusable_widget(e)
	editable_widget(e)
	val_widget(e)
	input_widget(e)

	e.class('x-markbox')

	e.checked_val = true
	e.unchecked_val = false

	e.icon_box = span({class: 'x-markbox-icon x-checkbox-icon far fa-square'})
	e.label_box = span({class: 'x-markbox-label x-checkbox-label'})
	e.focus_box = div({class: 'x-focus-box'}, e.icon_box, e.label_box)
	e.add(e.focus_box)

	e.add_info_button = function(btn) {
		btn.attr('bare', true)
		e.add(btn)
	}

	function update_icon() {
		let ie = e.icon_box
		ie.class('fa far fa-square fa-check-square fa-toggle-on fa-toggle-off', false)
		if (e.button_style == 'toggle')
			ie.classes = 'fa fa-toggle-'+(e.checked ? 'on' : 'off')
		else
			ie.classes = e.checked ? 'fa fa-check-square' : 'far fa-square'
	}

	e.set_button_style = update_icon
	e.prop('button_style', {store: 'var', type: 'enum', enum_values: ['checkbox', 'toggle'], default: 'checkbox', attr: true})

	// model

	e.get_checked = function() {
		return e.val === e.checked_val
	}
	e.set_checked = function(v, ev) {
		e.set_val(v ? e.checked_val : e.unchecked_val, ev)
	}
	e.prop('checked', {private: true})

	// view

	e.do_update_val = function(v) {
		let c = e.checked
		e.class('checked', c)
		update_icon()
		e.class('no-field', !e.field)
	}

	// controller

	e.toggle = function(ev) {
		e.set_checked(!e.checked, ev)
	}

	e.on('pointerdown', function(ev) {
		if (e.widget_editing)
			return
		ev.preventDefault() // prevent accidental selection by double-clicking.
		e.focus()
	})

	function click(ev) {
		if (e.widget_editing)
			return
		e.toggle({input: e})
		return false
	}

	e.icon_box.on('click', click)
	e.label_box.on('click', click)

	e.on('keydown', function(key, shift, ctrl) {
		if (e.widget_editing) {
			if (key == 'Enter') {
				if (ctrl)
					e.label_box.insert_at_caret('<br>')
				else
					e.widget_editing = false
				return false
			}
			return
		}
		if (key == 'Enter' || key == ' ') {
			e.toggle({input: e})
			return false
		}
		if (key == 'Delete') {
			e.val = null
			return false
		}
	})

	// widget editing ---------------------------------------------------------

	e.set_widget_editing = function(v) {
		e.label_box.contenteditable = v
		if (!v)
			e.label = e.label_box.innerText
	}

	e.on('pointerdown', function(ev) {
		if (e.widget_editing && ev.target != e.label_box)
			return this.capture_pointer(ev, null, function() {
				e.label_box.focus()
				e.label_box.select_all()
			})
	})

	function prevent_bubbling(ev) {
		if (e.widget_editing && !ev.ctrlKey)
			ev.stopPropagation()
	}
	e.label_box.on('pointerdown', prevent_bubbling)
	e.label_box.on('click', prevent_bubbling)

	e.label_box.on('blur', function() {
		e.widget_editing = false
	})

})

// ---------------------------------------------------------------------------
// radiogroup
// ---------------------------------------------------------------------------

component('x-radiogroup', 'Input', function(e) {

	val_widget(e)

	e.set_items = function(items) {
		for (let item of items) {
			if (isstr(item) || item instanceof Node)
				item = {text: item}
			let radio_box = span({class: 'x-markbox-icon x-radio-icon far fa-circle'})
			let text_box = span({class: 'x-markbox-label x-radio-label'})
			text_box.set(item.text)
			let idiv = div({class: 'x-widget x-markbox x-radio-item', tabindex: 0},
				radio_box, text_box)
			idiv.attr('align', e.align)
			idiv.item = item
			idiv.on('click', idiv_click)
			idiv.on('keydown', idiv_keydown)
			e.add(idiv)
		}
	}
	e.prop('items', {store: 'var', default: []})

	e.set_align = function(align) {
		for (let idiv of e.children)
			idiv.attr('align', align)
	}
	e.prop('align', {store: 'var', type: 'enum', enum_values: ['left', 'right'], default: 'left', attr: true})

	let sel_item

	e.do_update_val = function(i) {
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
	}

	function select_item(item) {
		e.set_val(item.index, {input: e})
		item.focus()
	}

	function idiv_click() {
		select_item(this)
		return false
	}

	function idiv_keydown(key) {
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
// editbox
// ---------------------------------------------------------------------------

component('x-editbox', 'Input', function(e) {

	val_widget(e)
	input_widget(e)

	e.input = tag('input', {class: 'x-editbox-input'})
	e.label_box = div({class: 'x-editbox-label'})
	e.focus_box = div({class: 'x-focus-box'}, e.input, e.label_box)
	e.add(e.focus_box)

	function do_update_state(s) {
		e.input.class('empty', s == '')
		e.label_box.class('empty', s == '')
	}

	e.from_text = function(s) { return e.field.from_text(s) }
	e.to_text = function(v) { return e.field ? e.field.to_text(v) : '' }

	e.do_update_val = function(v, ev) {
		if (ev && ev.input == e && ev.typing)
			return
		let s = e.to_text(v)
		let maxlen = e.field && e.field.maxlen
		e.input.value = s.slice(0, maxlen)
		do_update_state(s)
	}

	e.input.on('input', function() {
		let v = e.input.value
		e.set_val(e.from_text(v), {input: e, typing: true})
		do_update_state(v)
	})

	e.on('bind_field', function(on) {
		e.input.attr('maxlength', on ? e.field.maxlen : null)
		bind_picker(on)
	})

	// focusing

	focusable_widget(e, e.input)

	// suggestion picker ------------------------------------------------------

	e.prop('picker_w', {store: 'var', type: 'number', text: 'Picker Width'})

	e.create_picker = noop // stub

	function bind_picker(on) {
		assert(!(on && !e.bound))
		if (on) {
			e.picker = e.create_picker({
				id: e.id && e.id + '.picker',
				dropdown: e,
				nav: e.nav,
				col: e.col,
				can_select_widget: false,
				focusable: false,
			})
			if (!e.picker)
				return
			e.picker.class('picker', true)
			e.picker.bind(true)
			e.picker.on('val_picked', picker_val_picked)
		} else if (e.picker) {
			e.picker.popup(false)
			e.picker.bind(false)
			e.picker = null
		}
		document.on('pointerdown'     , document_pointerdown, on)
		document.on('rightpointerdown', document_pointerdown, on)
		document.on('stopped_event'   , document_stopped_event, on)
		e.input.on('keydown', keydown_for_picker, on)
	}

	e.set_isopen = function(open) {
		if (e.isopen == open)
			return
		if (!e.picker)
			return
		e.class('open', open)
		if (open) {
			e.cancel_val = e.input_val
			e.picker.min_w = e.rect().w
			if (e.picker_w)
				e.picker.auto_w = false
			e.picker.w = e.picker_w
			e.picker.show()
			e.picker.popup(e, 'bottom', e.align)
		} else {
			e.cancel_val = null
			e.picker.hide()
		}
	}

	e.open   = function() { e.set_isopen(true) }
	e.close  = function() { e.set_isopen(false) }
	e.cancel = function(ev) {
		if (e.isopen)
			e.set_val(e.cancel_val, ev)
		e.close()
	}

	e.property('isopen', () => e.hasclass('open'), e.set_isopen)

	function picker_val_picked(ev) {
		if (ev && ev.input == e.picker)
			e.close()
	}

	function keydown_for_picker(key) {
		if ((key == 'ArrowDown' || key == 'ArrowUp') && e.isopen) {
			e.picker.pick_near_val(key == 'ArrowDown' ? 1 : -1, {input: e})
			return false
		}
		if (key == 'Enter') {
			e.close()
			// don't return false so that grid can exit edit mode.
		}
		if (key == 'Escape') {
			e.close()
			// don't return false so that grid can exit edit mode.
		}
	}

	// clicking outside the picker closes the picker.
	function document_pointerdown(ev) {
		if (e.contains(ev.target)) // clicked inside the editbox.
			return
		if (e.picker.contains(ev.target)) // clicked inside the picker.
			return
		e.close()
	}

	// clicking outside the picker closes the picker, even if the click did something.
	function document_stopped_event(ev) {
		if (ev.type.ends('pointerdown'))
			document_pointerdown(ev)
	}

	// copy-to-clipboard button -----------------------------------------------

	e.set_copy_to_clipboard_button = function(v) {
		if (v && !e.clipboard_button) {
			function copy_to_clipboard() {
				copy_text(e.input.value, function() {
					notify(S('copied_to_clipboard', 'Copied to clipboard'), 'info')
				})
			}
			e.clipboard_button = button({
				classes: 'x-editbox-copy-to-clipboard-button',
				icon: 'far fa-clipboard',
				text: '',
				bare: true,
				focusable: false,
				title: S('copy_to_clipboard', 'Copy to clipboard'),
				action: copy_to_clipboard,
			})
			e.add(e.clipboard_button)
		} else if (!v && e.clipboard_button) {
			e.clipboard_button.remove()
			e.clipboard_button = null
		}
	}

	e.prop('copy_to_clipboard_button', {store: 'var', type: 'bool'})

	// grid editor protocol ---------------------------------------------------

	e.input.on('blur', function() {
		e.close()
		e.fire('lost_focus')
	})

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

	e.input.on('keydown', function(key, shift, ctrl) {
		// NOTE: we capture Ctrl+A on keydown because the user might
		// depress Ctrl first and when we get the 'a' Ctrl is not pressed.
		if (key == 'a' && ctrl)
			update_editor_state(null, 0, -1)
	})

	e.input.on('keyup', function(key, shift, ctrl) {
		if (key == 'ArrowLeft' || key == 'ArrowRight')
			update_editor_state(key == 'ArrowRight')
	})

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
			else if (s == 'all_selected')
				return leftmost && rightmost
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
		e.input.select_range(i0, i1)
	}

	e.set_text_min_w = function(w) {
		e.input.min_w = w
	}

})


// ---------------------------------------------------------------------------
// passedit
// ---------------------------------------------------------------------------

component('x-passedit', 'Input', function(e) {

	editbox.construct(e)
	e.input.attr('type', 'password')

	e.view_password_button = button({
		classes: 'x-passedit-eye-icon',
		icon: 'far fa-eye-slash',
		text: '',
		bare: true,
		focusable: false,
		title: S('view_password', 'View password'),
	})
	e.add(e.view_password_button)

	e.view_password_button.on('active', function(on) {
		let s1 = e.input.selectionStart
		let s2 = e.input.selectionEnd
		e.input.attr('type', on ? null : 'password')
		this.icon = 'far fa-eye' + (on ? '' : '-slash')
		if (!on) {
			after(0, function() {
				e.input.selectionStart = s1
				e.input.selectionEnd   = s2
			})
		}
	})

})

// ---------------------------------------------------------------------------
// spinedit
// ---------------------------------------------------------------------------

component('x-spinedit', 'Input', function(e) {

	editbox.construct(e)

	e.align = 'right'
	e.field_type = 'number'

	e.prop('button_style'    , {store: 'var', type: 'enum', enum_values: ['plus-minus', 'up-down', 'left-right'], default: 'plus-minus', attr: true})
	e.prop('button_placement', {store: 'var', type: 'enum', enum_values: ['each-side', 'left', 'right'], default: 'each-side', attr: true})

	e.up   = div({class: 'x-spinedit-button fa'})
	e.down = div({class: 'x-spinedit-button fa'})

	let inh_do_update = e.do_update
	e.do_update = function() {

		inh_do_update()

		let bs = e.button_style
		let bp = e.button_placement

		bp = bp || (bs == 'up-down' && 'left' || 'each-side')

		e.up  .remove()
		e.down.remove()

		e.up  .class('fa-plus'       , bs == 'plus-minus')
		e.down.class('fa-minus'      , bs == 'plus-minus')
		e.up  .class('fa-caret-up'   , bs == 'up-down')
		e.down.class('fa-caret-down' , bs == 'up-down')
		e.up  .class('fa-caret-right', bs == 'left-right')
		e.down.class('fa-caret-left' , bs == 'left-right')

		e.up  .class('left right leftmost rightmost', false)
		e.down.class('left right leftmost rightmost', false)

		if (bp == 'each-side') {
			e.insert(0, e.down)
			e.add(e.up)
			e.down.class('left  leftmost')
			e.up  .class('right rightmost')
		} else if (bp == 'right') {
			e.add(e.down, e.up)
			e.down.class('right')
			e.up  .class('right rightmost')
		} else if (bp == 'left') {
			e.insert(0, e.down, e.up)
			e.down.class('left leftmost')
			e.up  .class('left')
		}

	}

	// controller

	e.input.on('wheel', function(ev, dy) {
		e.set_val(e.input_val + (dy / 100), {input: e})
		e.input.select_range(0, -1)
		return false
	})

	// increment buttons click

	let increment
	function increment_val() {
		if (!increment) return
		let v = e.input_val + increment
		let r = v % or(e.field.multiple_of, 1)
		e.set_val(v - r, {input: e})
		e.input.select_range(0, -1)
	}
	let increment_timer
	function start_incrementing() {
		increment_val()
		increment_timer = setInterval(increment_val, 100)
	}
	let start_incrementing_timer
	function add_events(button, sign) {
		button.on('pointerdown', function() {
			if (start_incrementing_timer || increment_timer)
				return
			e.input.focus()
			increment = or(e.field.multiple_of, 1) * sign
			increment_val()
			start_incrementing_timer = after(.5, start_incrementing)
			return this.capture_pointer(ev, null, function() {
				clearTimeout(start_incrementing_timer)
				clearInterval(increment_timer)
				start_incrementing_timer = null
				increment_timer = null
				increment = 0
			})
		})
	}
	add_events(e.up  , 1)
	add_events(e.down, -1)

})

// ---------------------------------------------------------------------------
// tagsedit
// ---------------------------------------------------------------------------

component('x-tagsedit', 'Input', function(e) {

	e.class('x-editbox')

	e.field_type = 'tags'

	val_widget(e)
	input_widget(e)

	let S_expand = S('expand', 'expand') + ' (Enter)'
	let S_condense = S('condense', 'condense') + ' (Enter)'

	e.input = tag('input', {class: 'x-editbox-input x-tagsedit-input'})
	e.label_box = div({class: 'x-editbox-label x-tagsedit-label'})
	e.expand_button = div({class: 'x-tagsedit-button-expand fa fa-caret-up',
		title: S_expand,
	})
	e.add(e.expand_button, e.input, e.label_box)

	function update_tags() {

		let v = e.input_val
		let empty = !(v && v.length)

		if (empty && e.expanded) {
			e.expanded = false
			return
		}

		let i = e.len - 3
		while (i >= 1)
			e.at[i--].remove()

		if (e.bubble)
			e.bubble.content.clear()

		if (v) {
			let i = 1
			for (let tag of v) {
				let s = T(tag).textContent
				let xb = div({
					class: 'x-tagsedit-tag-xbutton fa fa-times',
					title: S('remove', 'remove {0}'.subst(s)),
				})
				let tag_e = div({
					class: 'x-tagsedit-tag',
					title: S('edit', 'edit {0}'.subst(s)),
				}, tag, xb)
				xb.on('pointerdown', tag_xbutton_pointerdown)
				tag_e.on('pointerdown', tag_pointerdown)
				if (e.expanded)
					e.bubble.content.add(tag_e)
				else
					e.insert(i++, tag_e)
			}
		}

		if (e.expanded)
			e.bubble.popup()

		e.class('empty', empty)
	}

	e.do_update_val = function(v, ev) {
		let by_user = ev && ev.input == e
		if (by_user)
			was_expanded = false
		update_tags()
		if (empty && by_user)
			e.input.focus()
		else
			e.input.value = null

		e.input.attr('maxlength', e.field ? e.field.maxlen : null)
	}

	// expanded bubble.

	e.set_expanded = function(expanded) {
		if (!(e.input_val && e.input_val.length))
			expanded = false
		e.class('expanded', expanded)
		e.expand_button.switch_class('fa-caret-up', 'fa-caret-down', expanded)
		if (expanded && !e.bubble)
			e.bubble = tooltip({classes: 'x-tagsedit-bubble', target: e, side: 'top', align: 'left'})
		update_tags()
		if (e.bubble)
			e.bubble.show(expanded)
		e.expand_button.title = expanded ? S_condense : S_expand
	}
	e.prop('expanded', {store: 'var', private: true})

	e.expand_button.on('pointerdown', function(ev) {
		e.expanded = !e.expanded
	})

	// controller

	function tag_pointerdown() {
		let v = e.input_val.slice()
		let tag = v.remove(this.index - (e.expanded ? 0 : 1))
		e.set_val(v, {input: e})
		e.input.value = tag
		e.focus()
		e.input.select()
		return false
	}

	function tag_xbutton_pointerdown() {
		let v = e.input_val.slice()
		v.remove(this.parent.index - (e.expanded ? 0 : 1))
		e.set_val(v, {input: e})
		return false
	}

	focusable_widget(e, e.input)

	let was_expanded

	e.input.on('blur', function() {
		was_expanded = e.expanded
		e.expanded = false
	})

	e.input.on('focus', function() {
		if (was_expanded)
			e.expanded = true
	})

	e.on('pointerdown', function(ev) {
		if (ev.target == e.input)
			return
		e.focus()
		return false
	})

	e.input.on('keydown', function(key, shift, ctrl) {
		if (key == 'Enter') {
			let s = e.input.value
			if (s) {
				s = s.trim()
				if (s) {
					let v = e.input_val && e.input_val.slice() || []
					v.push(s)
					e.set_val(v, {input: e})
				}
				e.input.value = null
			} else {
				was_expanded = false
				e.expanded = !e.expanded
			}
			return false
		}
		if (key == 'Backspace' && !e.input.value) {
			e.set_val(e.input_val && e.input_val.slice(0, -1), {input: e})
			return false
		}
	})

	// grid editor protocol

	e.input.on('blur', function() {
		e.fire('lost_focus')
	})

	e.set_text_min_w = function(w) {
		// TODO:
	}

})

// ---------------------------------------------------------------------------
// google maps APIs wrappers
// ---------------------------------------------------------------------------

{
	let api_key
	let autocomplete_service
	let session_token, token_expire_time
	let token_duration = 2 * 60  // google says it's "a few minutes"...

	function google_maps_iframe(place_id) {
		let iframe_src = place_id => place_id
			? ('https://www.google.com/maps/embed/v1/place?key='+api_key+'&q=place_id:'+place_id) : ''
		let iframe = tag('iframe', {
			frameborder: 0,
			scrolling: 'no',
			src: iframe_src(place_id),
			allowfullscreen: '',
		})
		iframe.goto_place = function(place_id) {
			iframe.src = iframe_src(place_id)
		}
		return iframe
	}

	/* TODO: finish this...
	function google_maps_wrap_map(e) {
		let map = new google.maps.Map(e, {
			center: { lat: -34.397, lng: 150.644 },
			zoom: 8,
		})

		map.goto_place = function(place_id) {
			if (!place.geometry) {
				return;
			}
			if (place.geometry.viewport) {
				map.fitBounds(place.geometry.viewport);
			} else {
				map.setCenter(place.geometry.location);
				map.setZoom(17)
			}
			// Set the position of the marker using the place ID and location.
			marker.setPlace({
			placeId: place.place_id,
			location: place.geometry.location,
			});
			marker.setVisible(true);
			infowindowContent.children.namedItem("place-name").textContent = place.name;
			infowindowContent.children.namedItem("place-id").textContent =
			place.place_id;
			infowindowContent.children.namedItem("place-address").textContent =
			place.formatted_address;
			infowindow.open(map, marker);

		}
	}
	*/

	function suggest_address(s, callback) {

		if (!autocomplete_service)
			return

		function get_places(places, status) {
			let pss = google.maps.places.PlacesServiceStatus
			if (status == pss.ZERO_RESULTS)
				notify(S('google_maps_address_not_found', 'Address not found on Google Maps'), 'search')
			if (status != pss.OK && status != pss.ZERO_RESULTS)
				notify(S('google_maps_error', 'Google Maps error: {0}', status))
			callback(places)
		}

		let now = time()
		if (!session_token || token_expire_time < now) {
			session_token = new google.maps.places.AutocompleteSessionToken()
			token_expire_time = now + token_duration
		}

		autocomplete_service.getPlacePredictions({input: s, sessionToken: session_token}, get_places)
	}

	function _google_places_api_loaded() {
		autocomplete_service = new google.maps.places.AutocompleteService()
		document.fire('google_places_api_loaded')
	}

	init_google_places_api = function(_api_key) {
		api_key = _api_key
		document.head.add(tag('script', {
			defer: '',
			src: 'https://maps.googleapis.com/maps/api/js?key='+api_key+'&libraries=places&callback=_google_places_api_loaded'
		}))
		init_google_places_api = noop // call-once
	}

}

// ---------------------------------------------------------------------------
// placeedit widget with autocomplete via google places api
// ---------------------------------------------------------------------------

component('x-placeedit', 'Input', function(e) {

	editbox.construct(e)

	e.field_type = 'place'

	e.pin_ct = span()
	e.add(e.pin_ct)

	e.create_picker = function(opt) {

		let lb = listbox(assign_opt({
			val_col: 0,
			display_col: 0,
			format_item: format_item,
		}, opt))

		return lb
	}

	function format_item(addr) {
		return addr.description
	}

	function suggested_addresses_changed(places) {
		places = places || []
		e.picker.items = places.map(function(p) {
			return {
				description: p.description,
				place_id: p.place_id,
				types: p.types,
			}
		})
		e.isopen = !!places.length
	}

	e.property('place_id', function() {
		return isobject(e.val) && e.val.place_id || null
	})

	e.from_text = function(s) { return s ? s : null }
	e.to_text = function(v) { return (isobject(v) ? v.description : v) || '' }

	e.override('do_update_val', function(inherited, v, ev) {
		inherited.call(this, v, ev)
		let pin = e.field && e.field.format_pin(v)
		e.pin_ct.set(pin)
		if (e.val && !e.place_id)
			pin.title = S('find_place', 'Find this place on Google Maps')
		if (ev && ev.input == e && ev.typing) {
			if (v)
				suggest_address(v, suggested_addresses_changed)
			else
				suggested_addresses_changed()
		}
	})

	e.pin_ct.on('pointerdown', function() {
		if (e.val && !e.place_id) {
			suggest_address(e.val, suggested_addresses_changed)
			return false
		}
	})

})

// ---------------------------------------------------------------------------
// google maps widget
// ---------------------------------------------------------------------------

component('x-googlemaps', 'Input', function(e) {

	val_widget(e)

	e.class('x-stretched')
	e.classes = 'fa fa-map-marked-alt'

	e.field_type = 'place'

	e.map = google_maps_iframe()
	e.map.class('x-googlemaps-iframe')
	e.add(e.map)

	e.override('do_update_val', function(inherited, v, ev) {
		inherited.call(this, v, ev)
		let place_id = isobject(v) && v.place_id || null
		e.map.goto_place(place_id)
		e.map.class('empty', !place_id)
	})

})

// ---------------------------------------------------------------------------
// slider
// ---------------------------------------------------------------------------

component('x-slider', 'Input', function(e) {

	focusable_widget(e)

	e.prop('from', {store: 'var', default: 0})
	e.prop('to', {store: 'var', default: 1})

	e.val_fill = div({class: 'x-slider-fill x-slider-value-fill'})
	e.range_fill = div({class: 'x-slider-fill x-slider-range-fill'})
	e.input_thumb = div({class: 'x-slider-thumb x-slider-input-thumb'})
	e.val_thumb = div({class: 'x-slider-thumb x-slider-value-thumb'})
	e.add(e.range_fill, e.val_fill, e.val_thumb, e.input_thumb)

	// model

	val_widget(e)

	e.field_type = 'number'

	let inh_do_update = e.do_update
	e.do_update = function() {
		inh_do_update()
		e.class('animated', e.field && e.field.multiple_of >= 5) // TODO: that's not the point of this.
	}

	function progress_for(v) {
		return clamp(lerp(v, e.from, e.to, 0, 1), 0, 1)
	}

	function cmin() { return max(or(e.field && e.field.min, -1/0), e.from) }
	function cmax() { return min(or(e.field && e.field.max, 1/0), e.to) }

	e.set_progress = function(p, ev) {
		let v = lerp(p, 0, 1, e.from, e.to)
		if (e.field.multiple_of != null)
			v = floor(v / e.field.multiple_of + .5) * e.field.multiple_of
		e.set_val(clamp(v, cmin(), cmax()), ev)
	}

	e.property('progress',
		function() {
			return progress_for(e.input_val)
		},
		e.set_progress,
	)

	// view

	function update_thumb(thumb, p, show) {
		thumb.show(show)
		thumb.style.left = (p * 100)+'%'
	}

	function update_fill(fill, p1, p2) {
		fill.style.left  = (p1 * 100)+'%'
		fill.style.width = ((p2 - p1) * 100)+'%'
	}

	e.do_update_val = function(v) {
		let input_p = progress_for(v)
		let val_p = progress_for(e.val)
		let diff = input_p != val_p
		update_thumb(e.val_thumb, val_p, diff)
		update_thumb(e.input_thumb, input_p)
		e.val_thumb.class('different', diff)
		e.input_thumb.class('different', diff)
		let p1 = progress_for(cmin())
		let p2 = progress_for(cmax())
		update_fill(e.val_fill, max(p1, 0), min(p2, val_p))
		update_fill(e.range_fill, p1, p2)
	}

	// controller

	e.input_thumb.on('pointerdown', function(ev) {
		e.focus()
		let r = e.input_thumb.rect()
		let hit_x = ev.clientX - (r.x + r.w / 2)
		return this.capture_pointer(ev, function(ev, mx, my) {
			let r = e.rect()
			e.set_progress((mx - r.x - hit_x) / r.w, {input: e})
			return false
		})
	})

	e.on('pointerdown', function(ev) {
		let r = e.rect()
		e.set_progress((ev.clientX - r.x) / r.w, {input: e})
	})

	e.on('keydown', function(key, shift) {
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
			e.set_progress(e.progress + d * (shift ? .1 : 1), {input: e})
			return false
		}
	})

	e.inspect_fields = [

		{name: 'from', type: 'number'},
		{name: 'to', type: 'number'},
		{name: 'multiple_of', type: 'number'},

		{name: 'grid_area'},
		{name: 'tabIndex', type: 'number'},

	]

})

// ---------------------------------------------------------------------------
// dropdown widget mixin
// ---------------------------------------------------------------------------

function dropdown_widget(e) {

	e.class('x-editbox')
	e.class('x-dropdown')

	val_widget(e)
	input_widget(e)
	focusable_widget(e)
	stylable_widget(e)

	e.props.mode.enum_values = ['default', 'inline', 'wrap', 'fixed']

	e.prop('picker_w', {store: 'var', type: 'number', text: 'Picker Width'})

	e.val_box = span({class: 'x-editbox-input x-dropdown-value'})
	e.button = span({class: 'x-dropdown-button fa fa-caret-down'})
	e.label_box = div({class: 'x-editbox-label x-dropdown-label'})
	e.focus_box = div({class: 'x-focus-box'}, e.val_box, e.button, e.label_box)
	e.add(e.focus_box)

	e.set_more_action = function(action) {
		if (!e.more_btn && action) {
			e.more_btn = div({class: 'x-editbox-more-button x-dropdown-more-button fa fa-ellipsis-h'})
			e.add(e.more_btn)
			e.more_btn.on('pointerdown', function(ev) {
				return this.capture_pointer(ev, null, function() {
					e.more_action()
					return false
				})
			})
		} else if (e.more_btn && !action) {
			e.more_btn.remove()
			e.more_btn = null
		}
	}
	e.prop('more_action', {store: 'var', private: true})

	let inh_set_nav = e.set_nav
	e.set_nav = function(v, v0) {
		inh_set_nav(v, v0)
		if (e.picker)
			e.picker.nav = v
	}

	let inh_set_col = e.set_col
	e.set_col = function(v, v0) {
		inh_set_col(v, v0)
		if (e.picker)
			e.picker.col = v
	}

	function bind_picker(on) {
		assert(!(on && !e.bound))
		if (on) {
			assert(!e.picker)
			e.picker = e.create_picker({
				id: e.id && e.id + '.picker',
				dropdown: e,
				nav: e.nav,
				col: e.col,
				can_select_widget: false,
			})
			e.picker.class('picker', true)
			e.picker.on('val_picked', picker_val_picked)
			e.picker.on('keydown'   , picker_keydown)
			e.picker.bind(true)
		} else if (e.picker) {
			e.picker.popup(false)
			e.picker.bind(false)
			e.picker = null
		}
		document.on('pointerdown'     , document_pointerdown, on)
		document.on('rightpointerdown', document_pointerdown, on)
		document.on('stopped_event'   , document_stopped_event, on)
	}

	e.on('bind_field', function(on) {
		if (!on)
			e.close()
		bind_picker(on)
	})

	// val updating

	e.do_update_val = function(v, ev) {
		let text = e.picker && e.picker.dropdown_display_val(v)
		if (text == null)
			text = e.display_val_for(v)
		let empty = text === ''
		e.val_box.class('empty', empty)
		e.label_box.class('empty', empty)
		e.val_box.set(text)
	}

	let do_error_tooltip_check = e.do_error_tooltip_check
	e.do_error_tooltip_check = function() {
		return do_error_tooltip_check() || (e.invalid && e.isopen)
	}

	// focusing

	let inh_focus = e.focus
	let focusing_picker
	e.focus = function() {
		if (e.isopen) {
			focusing_picker = true // focusout barrier.
			e.picker.focus()
			focusing_picker = false
		} else
			inh_focus.call(this)
	}

	// opening & closing the picker

	e.set_open = function(open, focus, hidden) {
		if (e.isopen != open) {
			e.class('open', open)
			e.button.switch_class('down', 'up', open)
			e.button.switch_class('fa-caret-down', 'fa-caret-up', open)
			if (open) {
				e.cancel_val = e.input_val
				e.picker.min_w = e.rect().w
				if (e.picker_w)
					e.picker.auto_w = false
				e.picker.w = e.picker_w
				e.picker.show(!hidden)
				e.picker.popup(e, 'bottom', e.align == 'right' ? 'end' : 'start')
				e.fire('opened')
			} else {
				e.cancel_val = null
				e.picker.hide()
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
	e.cancel = function(focus, ev) {
		if (e.isopen)
			e.set_val(e.cancel_val, ev)
		e.close(focus)
	}

	e.property('isopen',
		function() {
			return e.hasclass('open')
		},
		function(open) {
			e.set_open(open, true)
		}
	)

	// picker protocol

	function picker_val_picked(ev) {
		e.close(!(ev && ev.input == e))
	}

	// grid editor protocol

	e.set_text_min_w = function(w) {
		e.val_box.min_w = w
	}

	// keyboard & mouse binding

	e.on('pointerdown', function() {
		e.toggle(true)
		return false
	})

	e.on('keydown', function(key) {
		if (key == 'Enter' || key == ' ') {
			e.toggle(true)
			return false
		}
		if (key == 'ArrowDown' || key == 'ArrowUp') {
			if (!e.hasclass('grid-editor')) {
				e.set_open(true, false, true)
				e.picker.pick_near_val(key == 'ArrowDown' ? 1 : -1, {input: e})
				return false
			}
		}
		if (key == 'Delete') {
			e.set_val(null, {input: e})
			return false
		}
	})

	e.on('keypress', function(c) {
		if (e.picker.quicksearch) {
			e.picker.quicksearch(c)
			return false
		}
	})

	function picker_keydown(key) {
		if (key == 'Escape') {
			e.cancel(true)
			return false
		}
		if (key == 'Tab') {
			e.close(true)
			return false
		}
	}

	e.on('wheel', function(ev, dy) {
			e.set_open(true, false, true)
		e.picker.pick_near_val(dy / 100, {input: e})
		return false
	})

	// clicking outside the picker closes the picker.
	function document_pointerdown(ev) {
		if (e.contains(ev.target)) // clicked inside the dropdown.
			return
		if (e.picker.contains(ev.target)) // clicked inside the picker.
			return
		e.close()
	}

	// clicking outside the picker closes the picker, even if the click did something.
	function document_stopped_event(ev) {
		if (ev.type.ends('pointerdown'))
			document_pointerdown(ev)
	}

	e.on('focusout', function(ev) {
		// prevent dropdown's focusout from bubbling to the parent when opening the picker.
		if (focusing_picker)
			return false
		e.fire('lost_focus') // grid editor protocol
	})

}

// ---------------------------------------------------------------------------
// calendar widget
// ---------------------------------------------------------------------------

component('x-calendar', 'Input', function(e) {

	focusable_widget(e)
	e.class('x-focusable-items')
	val_widget(e)

	function format_month(i) {
		return month_name(time(0, i), 'short')
	}

	e.sel_day = div({class: 'x-calendar-sel-day'})
	e.sel_day_suffix = div({class: 'x-calendar-sel-day-suffix'})

	e.sel_month = list_dropdown({
		classes: 'x-calendar-sel-month',
		items: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
		field: {format: format_month},
		val_col: 0,
		display_col: 0,
		listbox: {
			format_item: format_month,
		},
	})

	e.sel_year = spinedit({
		classes: 'x-calendar-sel-year',
		field: {
			min: -10000,
			max:  10000,
		},
		button_style: 'left-right',
	})

	e.header = div({class: 'x-calendar-header'},
		e.sel_day, e.sel_day_suffix, e.sel_month, e.sel_year)

	e.weekview = tag('table', {class: 'x-calendar-weekview'})

	e.add(e.header, e.weekview)

	function as_ts(v) {
		return v != null && e.field && e.field.to_time ? e.field.to_time(v) : v
	}

	e.on('bind', function(on) {
		e.sel_year.bind(on)
		e.sel_month.bind(on)
	})

	e.do_update_val = function(v) {
		assert(e.bound)
		v = or(as_ts(v), time())
		let t = day(v)
		update_weekview(t, 6)
		let y = year_of(t)
		let n = floor(1 + days(t - month(t)))
		e.sel_day.set(n)
		let day_suffixes = ['', 'st', 'nd', 'rd']
		e.sel_day_suffix.set(locale.starts('en') ?
			(n < 11 || n > 13) && day_suffixes[n % 10] || 'th' : '')
		e.sel_month.val = month_of(t)
		e.sel_year.val = y
	}

	let sel_td
	function update_weekview(d, weeks) {
		let today = day(time())
		let this_month = month(d)
		let sel_d = day(as_ts(e.input_val))
		d = week(this_month)
		e.weekview.clear()
		sel_td = null
		for (let week = 0; week <= weeks; week++) {
			let tr = tag('tr')
			for (let weekday = 0; weekday < 7; weekday++) {
				if (!week) {
					let th = tag('th', {class: 'x-calendar-weekday'}, weekday_name(day(d, weekday)))
					tr.add(th)
				} else {
					let m = month(d)
					let s = d == today ? ' today' : ''
					s = s + (m == this_month ? ' current-month' : '')
					s = s + (d == sel_d ? ' focused selected' : '')
					let td = tag('td', {class: 'x-calendar-day x-item'+s}, floor(1 + days(d - m)))
					td.day = d
					tr.add(td)
					if (d == sel_d)
						sel_td = td
					d = day(d, 1)
				}
			}
			e.weekview.add(tr)
		}
	}

	// controller

	function set_ts(v, ev) {
		if (v != null && e.field.from_time)
			v = e.field.from_time(v)
		e.set_val(v, ev || {input: e})
	}

	e.weekview.on('pointerdown', function(ev) {
		let td = ev.target
		if (td.day == null)
			return
		if (sel_td) {
			sel_td.class('focused', false)
			sel_td.class('selected', false)
		}
		e.sel_month.cancel()
		e.focus()
		td.classes = 'focused selected'
		return this.capture_pointer(ev, null, function() {
			set_ts(td.day)
			e.fire('val_picked') // picker protocol
			return false
		})
	})

	e.sel_month.on('val_changed', function(v, ev) {
		if (ev && ev.input) {
			_d.setTime(as_ts(e.input_val) * 1000)
			_d.setMonth(this.val - 1)
			set_ts(_d.valueOf() / 1000)
		}
	})

	e.sel_year.on('val_changed', function(v, ev) {
		if (ev && ev.input) {
			_d.setTime(as_ts(e.input_val) * 1000)
			_d.setFullYear(this.val)
			set_ts(_d.valueOf() / 1000)
		}
	})

	e.weekview.on('wheel', function(ev, dy) {
		set_ts(day(as_ts(e.input_val), 7 * dy / 100))
		return false
	})

	e.on('keydown', function(key, shift) {
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
			set_ts(day(as_ts(e.input_val), d))
			return false
		}
		if (m) {
			let t = as_ts(e.input_val)
			_d.setTime(t * 1000)
			if (shift)
				_d.setFullYear(year_of(t) + m)
			else
				_d.setMonth(month_of(t) + m - 1)
			set_ts(_d.valueOf() / 1000)
			return false
		}
		if (key == 'Home') {
			let t = as_ts(e.input_val)
			set_ts(shift ? year(t) : month(t))
			return false
		}
		if (key == 'End') {
			let t = as_ts(e.input_val)
			set_ts(day(shift ? year(t, 1) : month(t, 1), -1))
			return false
		}
		if (key == 'Enter') {
			e.fire('val_picked', {input: e}) // picker protocol
			return false
		}
	})

	e.sel_month.on('keydown', function(key, shift) {
		if (key == 'Tab' && e.hasclass('picker')) {// capture Tab navigation.
			if (shift)
				e.focus()
			else
				e.sel_year.focus()
			return false
		}
	})

	e.sel_year.on('keydown', function(key, shift) {
		if (key == 'Tab' && e.hasclass('picker')) { // capture Tab navigation.
			if (shift)
				e.sel_month.focus()
			else
				e.focus()
			return false
		}
	})

	// hack: trick dropdown into thinking that our own opened dropdown picker
	// is our child, which is how we would implement dropdowns if this fucking
	// rendering model would allow us to decouple painting order from element's
	// position in the tree (IOW we need the concept of global z-index).
	let builtin_contains = e.contains
	e.contains = function(e1) {
		return builtin_contains.call(this, e1) || e.sel_month.picker.contains(e1)
	}

	e.pick_near_val = function(delta, ev) {
		set_ts(day(as_ts(e.input_val), delta), ev)
		e.fire('val_picked', ev)
	}

})

// ---------------------------------------------------------------------------
// date dropdown
// ---------------------------------------------------------------------------

component('x-date-dropdown', 'Input', function(e) {
	dropdown_widget(e)
	e.field_type = 'date'
	e.create_picker = calendar
})

// ---------------------------------------------------------------------------
// richedit
// ---------------------------------------------------------------------------

component('x-richedit', 'Input', function(e) {

	e.class('x-stretched')

	e.content_box = div({class: 'x-richtext-content'})
	e.focus_box = div({class: 'x-focus-box'}, e.content_box)
	e.add(e.focus_box)

	val_widget(e)
	editable_widget(e)
	richtext_widget_editing(e)

	e.do_update_val = function(v, ev) {
		if (ev && ev.input == e)
			return
		e.content_box.html = v
	}

	e.on('content_changed', function() {
		let v = e.content_box.html
		e.set_val(v ? v : null, {input: e})
	})

	e.on('bind', function(on) {
		if (on)
			e.editing = true
	})

})

// ---------------------------------------------------------------------------
// image
// ---------------------------------------------------------------------------

component('x-image', 'Input', function(e) {

	e.class('x-stretched')
	e.title = ''
	e.class('empty fa fa-camera')

	row_widget(e)

	// believe it or not, `src=''` is the only way to remove the border.
	e.img1 = tag('img', {class: 'x-image-img', src: ''})
	e.img2 = tag('img', {class: 'x-image-img', src: ''})
	e.next_img = tag('img', {class: 'x-image-img', src: ''})
	e.prev_img = tag('img', {class: 'x-image-img', src: ''})

	e.overlay = div({class: 'x-image-overlay'})

	e.upload_btn = div({class: 'x-image-button x-image-upload-button fa fa-cloud-upload-alt', title: S('upload_image', 'Upload image')})
	e.download_btn = div({class: 'x-image-button x-image-download-button fa fa-file-download', title: S('download_image', 'Download image')})
	e.buttons = span(0, e.upload_btn, e.download_btn)
	e.file_input = tag('input', {type: 'file', style: 'display: none'})
	e.overlay.add(e.buttons, e.file_input)

	e.add(e.img1, e.img2, e.overlay)

	function img_load(ev) {
		e.class('empty fa fa-camera', false)
		e.overlay.class('transparent', true)
		e.download_btn.bool_attr('disabled', null)
		e.title = S('image', 'Image')
		let img1 = e.img1
		let img2 = e.img2
		img1.style['z-index'] = 1
		img2.style['z-index'] = 0
		img1.class('loaded', true)
		img2.class('loaded', false)
		e.img1 = img2
		e.img2 = img1
		e.img1.show()
		e.img2.show()
	}
	e.img1.on('load', img_load)
	e.img2.on('load', img_load)

	function img_error(ev) {
		e.img1.hide()
		e.img2.hide()
		e.class('empty fa fa-camera', true)
		e.overlay.class('transparent', false)
		e.download_btn.bool_attr('disabled', true)
		e.title = S('no_image', 'No image')
	}
	e.img1.on('error', img_error)
	e.img2.on('error', img_error)

	e.format_url = function(vals, purpose) {
		return (purpose == 'upload' && e.upload_url_format || e.url_format || '').subst(vals)
	}

	function format_url(purpose) {
		let vals = e.row && e.nav.serialize_row_vals(e.row)
		return vals && e.format_url(vals, purpose)
	}

	e.do_update_row = function() {
		e.bool_attr('disabled', e.disabled || null)
		e.img1.attr('src', format_url() || '')
		e.img1.class('loaded', false)
		e.upload_btn.show(!e.disabled && e.allow_upload)
		e.download_btn.show(!e.disabled && e.allow_download)
	}

	e.prop('url_format'        , {store: 'var', attr: true})
	e.prop('upload_url_format' , {store: 'var', attr: true})
	e.prop('allow_upload'      , {store: 'var', type: 'bool', default: true, attr: true})
	e.prop('allow_download'    , {store: 'var', type: 'bool', default: true, attr: true})

	// upload/download error notifications

	e.notify = function(type, message, ...args) {
		notify(message, type)
		e.fire('notify', type, message, ...args)
	}

	// upload

	let upload_req
	e.upload = function(file) {
		if (upload_req)
			upload_req.abort()
		let reader = new FileReader()
		reader.onload = function(ev) {
			let file_contents = ev.target.result
			upload_req = ajax({
				url: format_url('upload'),
				upload: file_contents,
				headers: {
					'content-type': file.type,
					'content-disposition': 'attachment; filename="' + file.name + '"',
				},
				success: function() {
					e.update()
				},
				fail: function(type, status, message, body) {
					let err = this.error_message(type, status, message, body)
					if (err)
						e.notify('error', err, body)
				},
				done: function() {
					upload_req = null
				},
				upload_progress: function(p) {
					// TODO:
				},
			})
		}
		reader.readAsArrayBuffer(file)
	}

	e.overlay.on('dragenter', return_false)
	e.overlay.on('dragover', return_false)

	e.overlay.on('drop', function(ev) {
		if (!e.allow_upload)
			return false
		let files = ev.dataTransfer && ev.dataTransfer.files
		if (files && files.length)
			e.upload(files[0])
		return false
	})

	e.upload_btn.on('click', function() {
		e.file_input.click()
	})

	e.file_input.on('change', function() {
		if (this.files && this.files.length) {
			e.upload(this.files[0])
			// reset value or we won't get another change event for the same file.
			this.value = ''
		}
	})

	// download

	e.download_btn.on('click', function() {
		let href = format_url()
		let name = url(href).segments.last
		let link = tag('a', {href: href, download: name, style: 'display: none'})
		e.add(link)
		link.click()
		link.remove()
	})

})

// ---------------------------------------------------------------------------
// sql editor
// ---------------------------------------------------------------------------

component('x-sql-editor', 'Input', function(e) {

	e.class('x-stretched')

	val_widget(e)

	e.do_update_val = function(v, ev) {
		e.editor.getSession().setValue(v || '')
	}

	e.do_update_errors = function(errors, ev) {
		// TODO
	}

	e.on('bind', function(on) {
		if (on) {
			e.editor = ace.edit(e, {
					mode: 'ace/mode/mysql',
					highlightActiveLine: false,
					printMargin: false,
					displayIndentGuides: false,
					tabSize: 3,
					enableBasicAutocompletion: true,
				})
			//sql_editor_ct.on('blur'            , exit_widget_editing, on)
			//sql_editor_ct.on('raw:pointerdown' , prevent_bubbling, on)
			//sql_editor_ct.on('raw:pointerup'   , prevent_bubbling, on)
			//sql_editor_ct.on('raw:click'       , prevent_bubbling, on)
			//sql_editor_ct.on('raw:contextmenu' , prevent_bubbling, on)
			e.do_update_val(e.val)
			//sql_editor.getSession().getValue()
		} else {
			e.editor.destroy()
			e.editor = null
		}
	})

})

// ---------------------------------------------------------------------------
// chart
// ---------------------------------------------------------------------------

component('x-chart', 'Input', function(e) {

	e.class('x-stretched')

	contained_widget(e)
	serializable_widget(e)
	selectable_widget(e)

	// view -------------------------------------------------------------------

	let render = {} // {shape->func}
	let pointermove

	function slice_color(i, n) {
		return hsl_to_rgb(((i / n) * 360 - 120) % 180, .8, .7)
	}

	function cat_sum_label(cls, cols, vals, row, sum) {
		let label = div({class: cls})
		let i = 0
		for (let field of e.nav.flds(cols)) {
			let v = vals[i]
			let text = e.nav.cell_display_val_for(row, field, v)
			if (i == 1)
				label.add('/')
			label.add(text)
			i++
		}
		label.add(tag('br'))
		label.add(e.nav.cell_display_val_for(row, e.nav.fld(e.sum_col), sum))
		return label
	}

	function pie_slices() {

		let cat_groups = e.nav
			&& e.nav.flds(e.cat_cols) != null
			&& e.nav.fld(e.sum_col) != null
			&& e.nav.row_group(e.cat_cols, range_defs())

		if (!cat_groups)
			return

		let slices = []
		slices.total = 0
		for (let group of cat_groups) {
			let slice = {}
			let sum = 0
			for (let row of group)
				sum += e.nav.cell_val(row, e.sum_col)
			slice.sum = sum
			slice.label = cat_sum_label('x-chart-label', e.cat_cols, group.key_vals, group[0], sum)
			slices.push(slice)
			slices.total += sum
		}

		// sum small slices into a single "other" slice.
		let big_slices = []
		let other_slice
		for (let slice of slices) {
			slice.size = slice.sum / slices.total
			if (slice.size < e.other_threshold) {
				other_slice = other_slice || {sum: 0}
				other_slice.sum += slice.sum
			} else
				big_slices.push(slice)
		}
		if (other_slice) {
			other_slice.size = other_slice.sum / slices.total
			other_slice.label = div({class: 'x-chart-label'},
				e.other_text,
				tag('br'),
				e.nav.cell_display_val_for(null, e.nav.fld(e.sum_col), other_slice.sum)
			)
			big_slices.push(other_slice)
		}
		return big_slices
	}

	render.stack = function() {

		let slices = pie_slices()
		if (!slices)
			return

		let stack = div({class: 'x-chart-stack'})
		let labels = div({style: 'position: absolute;'})
		e.add(stack, labels)

		let i = 0
		for (let slice of slices) {
			let cdiv = div({class: 'x-chart-stack-slice'})
			let sdiv = div({class: 'x-chart-stack-slice-ct'}, cdiv, slice.label)
			sdiv.style.flex = slice.size
			cdiv.style['background-color'] = slice_color(i, slices.length)
			stack.add(sdiv)
			i++
		}

	}

	render.pie = function() {

		let slices = pie_slices()
		if (!slices)
			return

		let pie = div({class: 'x-chart-pie'})
		let labels = div({style: 'position: absolute;'})
		e.add(pie, labels)

		let w = e.clientWidth
		let h = e.clientHeight
		let pw = (w / h < 1 ? w : h) * .5

		pie.w = pw
		pie.h = pw
		pie.x = (w - pw) / 2
		pie.y = (h - pw) / 2

		let s = []
		let angle = 0
		let i = 0
		for (let slice of slices) {
			let arclen = slice.size * 360

			// generate a gradient step for this slice.
			let color = slice_color(i, slices.length)
			s.push(color + ' ' + angle.dec()+'deg '+(angle + arclen).dec()+'deg')

			// add the label and position it around the pie.
			labels.add(slice.label)
			let pad = 5
			let center_angle = angle + arclen / 2
			let [x, y] = point_around(w / 2, h / 2, pw / 2, center_angle - 90)
			slice.label.x = x + pad
			slice.label.y = y + pad
			let left = center_angle > 180
			let top  = center_angle < 90 || center_angle > 3 * 90
			if (left)
				slice.label.x = x - slice.label.clientWidth - pad
			if (top)
				slice.label.y = y - slice.label.clientHeight - pad

			angle += arclen
			i++
		}

		pie.style['background-image'] = 'conic-gradient(' + s.join(',') + ')'
	}

	function line_color(i, n) {
		return hsl_to_rgb(((i / n) * 180 - 210) % 360, .5, .6)
	}

	function render_line_or_columns(columns, rotate) {

		let groups = e.nav
			&& e.nav.fld(e.sum_col) != null
			&& e.nav.row_groups(e.cat_cols, range_defs())

		if (!groups)
			return

		let css = e.css()
		let r = e.rect()

		let pad_x1 = num(css['padding-left'  ])
		let pad_x2 = num(css['padding-right' ])
		let pad_y1 = num(css['padding-top'   ])
		let pad_y2 = num(css['padding-bottom'])

		let canvas = tag('canvas', {
			class: 'x-chart-canvas',
			width : r.w - pad_x1 - pad_x2,
			height: r.h - pad_y1 - pad_y2,
		})
		e.set(canvas)
		let cx = canvas.getContext('2d')

		let w = canvas.width
		let h = canvas.height

		let xgs = new Map() // {x_key -> xg}
		let min_xv =  1/0
		let max_xv = -1/0
		let min_sum =  1/0
		let max_sum = -1/0
		let sum_fi = e.nav.fld(e.sum_col).val_index

		for (let cg of groups) {
			for (let xg of cg) {

				let sum = 0
				for (let row of xg) {
					let v = row[sum_fi]
					sum += v
				}

				xg.sum = sum

				min_sum = min(min_sum, sum)
				max_sum = max(max_sum, sum)

				let xv = xg.key_vals[0]

				min_xv = min(min_xv, xv)
				max_xv = max(max_xv, xv)

				xgs.set(xv, xg)
			}
		}

		if (columns) {
			let w = (max_xv - min_xv) / xgs.size
			min_xv -= w / 2
			max_xv += w / 2
		}

		let max_n = rotate ? 5 : 10 // max number of y-axis markers
		let min_p = round((max_sum - min_sum) / max_n)
		let y_step_decimals = 0
		let y_step = ceil(min_p / 10) * 10
		min_sum = floor(min_sum / y_step) * y_step
		max_sum = ceil(max_sum / y_step) * y_step

		cx.font = css['font-size'] + ' ' + css.font

		let m = cx.measureText('M')
		let line_h = (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) * 1.5

		// paddings to make room for axis markers.
		let px1 = 40
		let px2 = 30
		let py1 = round(rotate ? line_h + 5 : 10)
		let py2 = line_h

		w -= px1 + px2
		h -= py1 + py2
		cx.translate(px1, py1)

		if (rotate) {
			cx.translate(w, 0)
			cx.rotate(rad * 90)
			;[w, h] = [h, w]
		}

		// compute line stop-points.
		for (let cg of groups) {
			let xgi = 0
			for (let xg of cg) {
				let xv = xg.key_vals[0]
				xg.x = round(lerp(xv, min_xv, max_xv, 0, w))
				xg.y = round(lerp(xg.sum, min_sum, max_sum, h - py2, 0))
				if (xg.y != xg.y)
					xg.y = xg.sum
				xgi++
			}
		}

		// draw x-axis labels & reference lines.
		let ref_line_color = css.getPropertyValue('--x-border-light')
		let label_color    = css.getPropertyValue('--x-fg-label')
		cx.fillStyle   = label_color
		cx.strokeStyle = ref_line_color
		for (let xg of xgs.values()) {
			// draw x-axis label.
			let m = cx.measureText(xg.text)
			cx.save()
			if (rotate) {
				let text_h = m.actualBoundingBoxAscent - m.actualBoundingBoxDescent
				let x = round(xg.x + text_h / 2)
				let y = h + m.width
				cx.translate(x, y)
				cx.rotate(rad * -90)
			} else {
				let x = xg.x - m.width / 2
				let y = round(h)
				cx.translate(x, y)
			}
			cx.fillText(xg.text, 0, 0)
			cx.restore()
			// draw x-axis center line marker.
			cx.beginPath()
			cx.moveTo(xg.x + .5, h - py2 + 0.5)
			cx.lineTo(xg.x + .5, h - py2 + 4.5)
			cx.stroke()
		}

		// draw y-axis labels & reference lines.
		for (let sum = min_sum; sum <= max_sum; sum += y_step) {
			// draw y-axis label.
			let y = round(lerp(sum, min_sum, max_sum, h - py2, 0))
			let s = sum.dec(y_step_decimals)
			let m = cx.measureText(s)
			let text_h = m.actualBoundingBoxAscent - m.actualBoundingBoxDescent
			cx.save()
			if (rotate) {
				let px = -5
				let py = round(y + m.width / 2)
				cx.translate(px, py)
				cx.rotate(rad * -90)
			} else {
				let px = -m.width - 10
				let py = round(y + text_h / 2)
				cx.translate(px, py)
			}
			cx.fillText(s, 0, 0)
			cx.restore()
			// draw y-axis strike-through line marker.
			cx.strokeStyle = ref_line_color
			cx.beginPath()
			cx.moveTo(0 + .5, y - .5)
			cx.lineTo(w + .5, y - .5)
			cx.stroke()
		}

		// draw the axis.
		cx.strokeStyle = ref_line_color
		cx.beginPath()
		// y-axis
		cx.moveTo(.5, round(lerp(min_sum, min_sum, max_sum, h - py2, 0)) + .5)
		cx.lineTo(.5, round(lerp(max_sum, min_sum, max_sum, h - py2, 0)) + .5)
		// x-axis
		cx.moveTo(round(lerp(min_xv, min_xv, max_xv, 0, w)) + .5, round(h - py2) - .5)
		cx.lineTo(round(lerp(max_xv, min_xv, max_xv, 0, w)) + .5, round(h - py2) - .5)
		cx.stroke()

		if (columns) {

			let cn = groups.length
			let bar_w = round(w / (xgs.size - 1) / cn / 3)
			let half_w = round((bar_w * cn + 2 * (cn - 1)) / 2)

			function bar_rect(cgi, xg) {
				let x = xg.x
				let y = xg.y
				return [
					x + cgi * (bar_w + 2) - half_w,
					y,
					bar_w,
					h - py2 - y
				]
			}
		}

		// draw the chart lines or columns.
		let cgi = 0
		for (let cg of groups) {

			let color = line_color(cgi, groups.length)

			if (columns) {

				cx.fillStyle = color
				for (let xg of cg) {
					let [x, y, w, h] = bar_rect(cgi, xg)
					cx.beginPath()
					cx.rect(x, y, w, h)
					cx.fill()
				}

			} else {

				// draw the line.
				cx.beginPath()
				let first
				for (let xg of cg) {
					if (!first) {
						cx.moveTo(xg.x, xg.y)
						first = true
					} else
						cx.lineTo(xg.x, xg.y)
				}
				cx.strokeStyle = color
				cx.stroke()

				// draw a dot on each line cusp.
				cx.fillStyle = cx.strokeStyle
				for (let xg of cg) {
					cx.beginPath()
					cx.arc(xg.x, xg.y, 3, 0, 2*PI)
					cx.fill()
				}

			}

			cgi++
		}

		function hit_test_columns(mx, my) {
			let cgi = 0
			for (let cg of groups) {
				for (let xg of cg) {
					let [x, y, w, h] = bar_rect(cgi, xg)
					if (mx >= x && mx <= x + w && my >= y && my <= y + h)
						return [cg, xg, x, y, w, h]
				}
				cgi++
			}
		}

		function hit_test_dots(mx, my) {
			let max_d = 16**2
			let min_d = 1/0
			let hit_cg, hit_xg
			for (let cg of groups) {
				for (let xg of cg) {
					let dx = abs(mx - xg.x)
					let dy = abs(my - xg.y)
					let d = dx**2 + dy**2
					if (d <= min(min_d, max_d)) {
						min_d = d
						hit_cg = cg
						hit_xg = xg
					}
				}
			}
			if (hit_cg)
				return [hit_cg, hit_xg, hit_xg.x, hit_xg.y, 0, 0]
		}

		let tt

		pointermove = function(ev, mx, my) {
			let r = canvas.rect()
			mx -= r.x
			my -= r.y
			let mp = new DOMPoint(mx, my).matrixTransform(cx.getTransform().invertSelf())
			mx = mp.x
			my = mp.y
			let hit = columns ? hit_test_columns(mx, my) : hit_test_dots(mx, my)
			if (hit) {
				let [cg, xg, x, y, w, h] = hit
				tt = tt || tooltip({
					target: e,
					side: rotate ? 'right' : 'top',
					align: 'center',
					kind: 'info',
					classes: 'x-chart-tooltip',
				})
				tt.begin_update()
				tt.text = cat_sum_label('x-chart-tooltip-label', cg.key_cols, cg.key_vals, xg, xg.sum)
				let tm = cx.getTransform()
				let p1 = new DOMPoint(x    , y    ).matrixTransform(tm)
				let p2 = new DOMPoint(x + w, y + h).matrixTransform(tm)
				let p3 = new DOMPoint(x + w, y    ).matrixTransform(tm)
				let p4 = new DOMPoint(x    , y + h).matrixTransform(tm)
				let x1 = min(p1.x, p2.x, p3.x, p4.x)
				let y1 = min(p1.y, p2.y, p3.y, p4.y)
				let x2 = max(p1.x, p2.x, p3.x, p4.x)
				let y2 = max(p1.y, p2.y, p3.y, p4.y)
				tt.px = x1 + pad_x1
				tt.py = y1 + pad_y1
				tt.pw = x2 - x1
				tt.ph = y2 - y1
				tt.show()
				tt.end_update()
				return
			}
			if (tt)
				tt.hide()
		}

	}

	render.line = render_line_or_columns
	render.column = function() { render_line_or_columns(true) }
	render.bar = function() { render_line_or_columns(true, true) }

	e.do_update = function() {
		pointermove = noop
		e.clear()
		render[e.shape]()
	}

	e.on('pointermove' , function(...args) { pointermove(...args) })
	e.on('pointerleave', function(...args) { pointermove(...args) })

	// config -----------------------------------------------------------------

	function range_defs() {
		let defs
		for (let col of e.cat_cols.split(/[\s,]+/)) {
			let freq   = e['cat_cols.'+col+'.range_freq'  ]
			let offset = e['cat_cols.'+col+'.range_offset']
			let unit   = e['cat_cols.'+col+'.range_unit'  ]
			if (freq != null || offset != null || unit != null) {
				defs = defs || {}
				defs[col] = {
					freq   : freq,
					offset : offset,
					unit   : unit,
				}
			}
		}
		return defs
	}

	function redraw() {
		e.update()
	}

	function bind_nav(nav, on) {
		if (!e.bound)
			return
		if (!nav)
			return
		nav.on('reset'               , redraw, on)
		nav.on('rows_changed'        , redraw, on)
		nav.on('cell_val_changed'    , redraw, on)
		nav.on('display_vals_changed', redraw, on)
	}

	e.on('bind', function(on) {
		bind_nav(e.nav, on)
		document.on('layout_changed', redraw, on)
	})

	e.set_nav = function(nav1, nav0) {
		assert(nav1 != e)
		bind_nav(nav0, false)
		bind_nav(nav1, true)
		redraw()
	}

	e.prop('nav', {store: 'var', private: true})
	e.prop('nav_id' , {store: 'var', bind_id: 'nav', type: 'nav'})

	e.set_sum_col         = redraw
	e.set_other_threshold = redraw
	e.set_other_text      = redraw

	e.set_cat_cols = function(cat_cols, cat_cols0) {
		if (cat_cols0)
			for (let col of cat_cols0.names()) {
				delete e.props['cat_col.'+col+'.range_freq'  ]
				delete e.props['cat_col.'+col+'.range_offset']
				delete e.props['cat_col.'+col+'.range_unit'  ]
			}
		if (cat_cols)
			for (let col of cat_cols.names()) {
				e.props['cat_col.'+col+'.range_freq'  ] = {name: 'cat_col.'+col+'.range_freq'  , type: 'number'}
				e.props['cat_col.'+col+'.range_offset'] = {name: 'cat_col.'+col+'.range_offset', type: 'number'}
				e.props['cat_col.'+col+'.range_unit'  ] = {name: 'cat_col.'+col+'.range_unit'  , type: 'enum', enum_values: ['month', 'year']}
			}
		redraw()
	}

	e.set_prop = function(k, v) {
		let v0 = e[k]
		e[k] = v
		if (v !== v0 && k.starts('cat_col.')) {
			redraw()
			document.fire('prop_changed', e, k, v, v0, null)
		}
	}

	e.prop('sum_col' , {store: 'var', type: 'col', col_nav: () => e.nav})
	e.prop('cat_cols', {store: 'var', type: 'col', col_nav: () => e.nav})
	e.prop('other_threshold', {store: 'var', type: 'number', default: .05, multiple_of: null})
	e.prop('other_text', {store: 'var', default: 'Other'})
	e.prop('shape', {
		store: 'var', type: 'enum',
		enum_values: ['pie', 'stack', 'line', 'area', 'column', 'bar', 'stackbar', 'bubble', 'scatter'],
		default: 'pie', attr: true,
	})

})

// ---------------------------------------------------------------------------
// x-input
// ---------------------------------------------------------------------------

component('x-input', 'Input', function(e) {

	val_widget(e, true, false)

	e.prop('widget_type', {store: 'var', type: 'enum', enum_values: []})

	function widget_type(type) {
		if (type) return type
		let types = input.widget_types[e.field.type]
		return types && types[0] || 'editbox'
	}

	function bind_field(on) {
		if (on) {
			let type = widget_type(e.widget_type)
			let opt = assign_opt({
				type: type,
				nav: e.nav,
				col: e.col,
				classes: 'x-stretched',
			}, input.widget_type_options[type])
			each_widget_prop(function(k, v) { opt[k] = v })
			e.widget = component.create(opt)
			e.set(e.widget)
		} else {
			if (e.widget) {
				e.widget.remove()
				e.widget = null
			}
		}
	}

	e.on('bind_field', bind_field)

	e.set_widget_type = function(v) {
		if (!e.initialized)
			return
		if (!e.field)
			return
		if (widget_type(v) == widget_type(e.widget_type))
			return
		bind_field(false)
		bind_field(true)
	}

	// proxy out widget.* properties to the widget.

	function each_widget_prop(f) {
		for (let k in e) {
			if (k.starts('widget.')) {
				let v = e.get_prop(k)
				k = k.replace(/^widget\./, '')
				f(k, v)
			}
		}
	}

	e.set_prop = function(k, v) {
		let v0 = e[k]
		e[k] = v
		if (v !== v0 && e.widget && k.starts('widget.')) {
			k = k.replace(/^widget\./, '')
			e.widget[k] = v
			document.fire('prop_changed', e, k, v, v0, null)
		}
	}

	e.override('init', function(inherited) {
		inherited.call(this)
		e.set_widget_type(e.widget_type)
	})

})

input.widget_types = {
	number   : ['spinedit', 'slider'],
	bool     : ['checkbox'],
	datetime : ['date_dropdown'],
	date     : ['date_dropdown'],
	enum     : ['enum_dropdown'],
	image    : ['image'],
	tags     : ['tagsedit'],
	place    : ['placeedit', 'googlemaps'],
}

input.widget_type_options = {
	tagsedit: {mode: 'fixed'},
}

// ---------------------------------------------------------------------------
// form
// ---------------------------------------------------------------------------

component('x-form', 'Containers', function(e) {

	e.class('x-stretched')
	e.class('x-flex')

	serializable_widget(e)
	selectable_widget(e)
	editable_widget(e)
	contained_widget(e)
	let html_items = widget_items_widget(e)

	// generate a 3-letter value for `grid-area` based on item's `col` attr or `id`.
	let names = {}
	function area_name(item) {
		let s = item.attr('area') || item.col || item.attr('col') || item.id
		if (!s) return
		s = s.slice(0, 3)
		if (names[s]) {
			let x = num(names[s][2]) || 1
			do { s = s.slice(0, 2) + (x + 1) } while (names[s])
		}
		names[s] = true
		return s
	}

	// widget-items widget protocol.
	e.do_init_items = function() {
		for (let item of e.items) {
			if (!item.style['grid-area'])
				item.style['grid-area'] = area_name(item)
			e.add(item)
		}
	}

	e.on('resize', function(r) {
		if (!e.bound)
			return
		let n = clamp(floor(r.w / 150), 1, 12)
		for (let i = 1; i <= 12; i++)
			e.class('maxcols'+i, i <= n)
		e.class('compact', n < 2)
	})

	e.on('bind', function(on) {
		if (on)
			e.fire('resize', e.rect())
	})

	e.set_nav = function(nav) {
		for (let item of e.items)
			item.nav = nav
	}
	e.prop('nav', {store: 'var', private: true})
	e.prop('nav_id', {store: 'var', bind_id: 'nav', type: 'nav', attr: true})

	return {items: html_items}

})

