
// ---------------------------------------------------------------------------
// prop layers
// ---------------------------------------------------------------------------

function xmodule(e) {

	let generation = 0

	assert(e.prop_layer_slots) // {slot -> layer_obj} in correct order.
	e.widgets = {} // {gid -> e}
	e.prop_layers = {} // {layer -> {slot:, name:, widgets: {gid -> prop_vals}}}
	e.selected_prop_slot = null

	e.resolve = gid => e.widgets[gid]

	e.nav_editor = function(...options) {
		return widget_select_editor(e.widgets, e => e.isnav, ...options)
	}

	document.on('widget_attached', function(te) {
		e.widgets[te.gid] = te
		e.update_widget(te)
		document.fire('widget_tree_changed')
	})

	document.on('widget_detached', function(te) {
		delete e.widgets[te.gid]
		document.fire('widget_tree_changed')
	})

	document.on('prop_changed', function(te, k, v, v0, def) {
		if (te.xmodule_updating_props) return
		let slot = e.selected_prop_slot || te.props[k].slot || 'base'
		e.set_prop(te, slot, k, v)
	})

	e.prop_vals = function(gid) {
		let t = {gid: gid, prop_layers_generation: generation}
		for (let slot in e.prop_layer_slots) {
			let layer_obj = e.prop_layer_slots[slot]
			if (layer_obj) {
				let prop_vals = layer_obj.widgets[gid]
				update(t, prop_vals)
			}
		}
		return t
	}

	e.update_widget = function(te) {
		if (te.prop_layers_generation == generation)
			return
		te.begin_update()
		let vals = e.prop_vals(te.gid)
		te.xmodule_updating_props = true
		let pv0 = te.__pv0 // prop values before the last override.
		te.__pv0 = {} // prop values before this override.
		// restore prop vals that were overriden last time and that
		// are not present in this override.
		if (pv0)
			for (let prop in pv0)
				if (!(prop in vals))
					te[prop] = pv0[prop]
		// apply this override preserving previous values.
		for (let prop in vals) {
			te.__pv0[prop] = te[prop]
			te[prop] = vals[prop]
		}
		te.xmodule_updating_props = false
		te.end_update()
	}

	e.set_prop_layer = function(slot, layer, reload, on_loaded) {

		if (!layer) {
			e.prop_layer_slots[slot] = null
			return
		}

		function update_layer(layer_widgets) {

			generation++

			if (slot) {
				let old_layer_obj = e.prop_layer_slots[slot]
				if (old_layer_obj)
					old_layer_obj.slot = null
			}
			let layer_obj = {slot: slot, name: layer, widgets: layer_widgets}
			e.prop_layers[layer] = layer_obj
			if (slot)
				e.prop_layer_slots[slot] = layer_obj

			// update all attached widgets.
			for (let gid in e.widgets)
				if (layer_widgets[gid])
					e.update_widget(e.widgets[gid])

			if (slot)
				document.fire('prop_layer_slots_changed')

			if (on_loaded)
				on_loaded()
		}

		let layer_obj = e.prop_layers[layer]
		if (!layer_obj || reload) {
			ajax({
				url: 'xmodule-layer.json/'+layer,
				success: function(widgets) {
					update_layer(widgets)
				},
				fail: function(how, status) {
					if (how == 'http' && status == 404)
						update_layer({})
				},
			})
		} else {
			update_layer(layer_obj.widgets)
		}

	}

	e.save_prop_layer = function(layer) {
		let layer_obj = e.prop_layers[layer]
		if (layer_obj.save_request)
			return // already saving...
		layer_obj.save_request = ajax({
			url: 'xmodule-layer.json/'+layer,
			upload: json(layer_obj.widgets, null, '\t'),
			done: () => layer_obj.save_request = null,
		})
	}

	e.reload = function() {
		for (let layer in e.prop_layers) {
			let layer_obj = e.prop_layers[layer]
			e.set_prop_layer(layer_obj.slot, layer, true)
		}
	}

	e.set_prop = function(te, slot, k, v) {
		if (!te.gid) return

		let layer_obj = e.prop_layer_slots[slot]
		if (!layer_obj) return

		let def = te.props[k]
		if (slot == 'base' && v === def.default)
			v = undefined // delete defaults from store.
		else if (def.serialize)
			v = def.serialize(v)
		else if (isobject(v) && v.serialize)
			v = v.serialize()

		let t = layer_obj.widgets[te.gid]

		if (t && t[k] === v) // value already stored.
			return

		if (!t) {
			t = {}
			layer_obj.widgets[te.gid] = t
		}
		layer_obj.modified = true
		if (v === undefined)
			delete t[k] // can't store `undefined` because nav can't.
		else
			t[k] = v
	}

	e.save = function() {
		for (let layer in e.prop_layers)
			if (e.prop_layers[layer].modified)
				e.save_prop_layer(layer)
	}

	e.assign_gid = function(widget) {
		ajax({
			url: 'xmodule-next-gid',
			method: 'post',
			// TODO: find another way since smart-ass condescending w3c people
			// deprecated synchronous requests.
			async: false,
			success: function(gid) {
				widget.gid = gid
			},
		})
	}

	return e

}

// ---------------------------------------------------------------------------
// rowsets nav
// ---------------------------------------------------------------------------

//rowsets_nav = bare_nav({rowset_name: 'rowsets'})
//rowsets_nav.reload()

// ---------------------------------------------------------------------------
// rowset types
// ---------------------------------------------------------------------------

field_types.rowset = {}

field_types.rowset.editor = function(...options) {
	function more() {
		let d = sql_rowset_editor_dialog()
		d.modal()
	}
	return list_dropdown(update({
		nolabel: true,
		rowset_name: 'rowsets',
		val_col: 'name',
		display_col: 'name',
		mode: 'fixed',
		more_action: more,
	}, ...options))
}

// col

field_types.col = {}

/*
field_types.col.editor = function(...options) {
	let rs = rowset({
		fields: [{name: 'name'}],
	})
	let e = list_dropdown(update({
		nolabel: true,
		lookup_rowset: rs,
		mode: 'fixed',
	}, ...options))
	let rs_field = e.nav.rowset.field(this.rowset_col)
	let rs_name = e.nav.rowset.value(e.nav.focused_row, rs_field)
	let rs = rs_name && global_rowset(rs_name)
	if (rs) {
		rs.once('loaded', function() {
			let rows = rs.fields.map(field => [field.name])
			e.lookup_rowset.reset({
				rows: rows,
			})
		})
		rs.load_fields()
	}
	return e
}
*/

// ---------------------------------------------------------------------------
// property inspector
// ---------------------------------------------------------------------------

function widget_select_editor(widgets_gid_map, filter, ...options) {
	let dd = list_dropdown({
		rowset: {
			fields: [{name: 'gid'}],
		},
		nolabel: true,
		val_col: 'gid',
		display_col: 'gid',
		mode: 'fixed',
	}, ...options)
	function reset_nav() {
		let rows = []
		for (let gid in widgets_gid_map) {
			let te = widgets_gid_map[gid]
			if (te.can_select_widget && filter(te))
				rows.push([gid])
		}
		dd.picker.rowset.rows = rows
		dd.picker.reset()
	}
	dd.on('bind', function(on) {
		document.on('widget_tree_changed', reset_nav, on)
	})
	reset_nav()
	return dd
}

field_types.nav = {}
field_types.nav.editor = function(...args) {
	return xmodule.nav_editor(...args)
}

component('x-prop-inspector', function(e) {

	grid.construct(e)
	e.cell_h = 22

	e.can_add_rows = false
	e.can_remove_rows = false

	e.can_select_widget = false

	e.vertical = true

	e.exit_edit_on_lost_focus = false
	e.can_sort_rows = false
	e.enable_context_menu = false
	e.focus_cell_on_click_header = true

	// prevent getting out of edit mode.
	e.auto_edit_first_cell = true
	e.enter_edit_on_click = true
	e.exit_edit_on_escape = false
	e.exit_edit_on_enter = false
	e.stay_in_edit_mode = true

	e.on('bind', function(on) {
		document.on('selected_widgets_changed', selected_widgets_changed, on)
		document.on('prop_changed', prop_changed, on)
		document.on('focusin', focus_changed, on)
		if (on)
			reset()
	})

	e.on('val_changed', function(row, field, val) {
		if (!widgets)
			reset()
		for (let e of widgets)
			e[field.name] = val
	})

	function selected_widgets_changed() {
		reset()
	}

	let barrier
	function focus_changed() {
		if (barrier) return
		if (selected_widgets.size)
			return
		let fe = focused_widget()
		if (!fe || !fe.can_select_widget)
			return
		barrier = true
		reset()
		barrier = false
	}

	function prop_changed(widget, k, v) {
		if (!widgets.has(widget))
			return
		let field = e.all_fields[k]
		if (!field)
			return
		if (e.editor && e.focused_field == field)
			return
		e.focus_cell(0, e.field_index(field))
		e.reset_val(e.focused_row, field, v)
	}

	/*
	e.on('exit_edit', function(ri, fi) {
		let field = e.fields[fi]
		e.reset_cell_val(e.rows[ri], field, e.widget[field.name])
	})
	*/

	let widgets

	function reset() {

		widgets = selected_widgets
		if (!selected_widgets.size && focused_widget() && !up_widget_which(focused_widget(), e => !e.can_select_widget))
			widgets = new Set([focused_widget()])

		let rs = {}
		rs.fields = []
		let vals = []
		rs.rows = [vals]

		let prop_counts = {}
		let props = {}
		let prop_vals = {}

		for (let e of widgets)
			for (let prop in e.props)
					if (widgets.size == 1 || !e.props[prop].unique) {
						prop_counts[prop] = (prop_counts[prop] || 0) + 1
						props[prop] = e.props[prop]
						prop_vals[prop] = prop in prop_vals && prop_vals[prop] !== e[prop] ? undefined : e[prop]
					}

		for (let prop in prop_counts)
			if (prop_counts[prop] == widgets.size) {
				rs.fields.push(props[prop])
				vals.push(prop_vals[prop])
			}

		e.rowset = rs
		e.reset()

		e.title_text = ([...widgets].map(e => e.type + (e.gid ? ' ' + e.gid : ''))).join(' ')

		e.fire('prop_inspector_changed')
	}

	// prevent unselecting all widgets by default on document.pointerdown.
	e.on('pointerdown', function(ev) {
		ev.stopPropagation()
	})

})

// ---------------------------------------------------------------------------
// widget tree
// ---------------------------------------------------------------------------

component('x-widget-tree', function(e) {

	grid.construct(e)
	e.cell_h = 22

	function widget_tree_rows() {
		let rows = new Set()
		function add_widget(e, pe) {
			if (!e) return
			rows.add([e, pe, true])
			if (e.child_widgets)
				for (let ce of e.child_widgets())
					add_widget(ce, e)
		}
		add_widget(root_widget)
		return rows
	}

	function widget_name(e) {
		return () => typeof e == 'string'
			? e : H((e.id && '<b>'+e.id+'</b> ' || e.type.replace('_', ' ')))
	}

	let rs = {
		fields: [
			{name: 'widget', format: widget_name},
			{name: 'parent_widget', visible: false},
			{name: 'id', w: 40, format: (_, row) => row[0].id, visible: false},
		],
		rows: widget_tree_rows(),
		pk: 'widget',
		parent_col: 'parent_widget',
	}

	e.rowset = rs
	e.cols = 'id widget'
	e.tree_col = 'widget'

	e.can_select_widget = false
	e.header_visible = false
	e.can_focus_cells = false
	e.can_change_rows = false
	e.auto_focus_first_cell = false
	e.can_select_non_siblings = false

	function get_widget() {
		return e.focused_row && e.focused_row[0]
	}
	function set_widget(widget) {
		let row = e.lookup(e.all_fields[0], widget)
		let ri = e.row_index(row)
		e.focus_cell(ri, 0)
	}
	e.property('widget', get_widget, set_widget)

	let barrier

	e.on('selected_rows_changed', function() {
		if (barrier) return
		barrier = true
		let to_unselect = new Set(selected_widgets)
		for (let [row] of e.selected_rows) {
			let ce = row[0]
			ce.set_widget_selected(true, false, false)
			to_unselect.delete(ce)
		}
		for (let ce of to_unselect)
			ce.set_widget_selected(false, false, false)
		document.fire('selected_widgets_changed')
		barrier = false
	})

	function select_widgets(widgets) {
		let rows = new Map()
		for (let ce of widgets) {
			let row = e.lookup(e.all_fields[0], ce)
			rows.set(row, true)
		}
		let focused_widget = [...widgets].pop()
		let row = e.lookup(e.all_fields[0], focused_widget)
		let ri = e.row_index(row)
		e.focus_cell(ri, null, 0, 0, {
			selected_rows: rows,
			must_not_move_row: true,
			unfocus_if_not_found: true,
			dont_select_widgets: true,
		})
	}

	function selected_widgets_changed() {
		if (barrier) return
		barrier = true
		select_widgets(selected_widgets)
		barrier = false
	}

	function widget_tree_changed() {
		rs.rows = widget_tree_rows()
		e.reset()
	}

	/* TODO: not sure what to do here...
	function focus_changed() {
		if (selected_widgets.size)
			return
		let fe = focused_widget()
		if (!fe || !fe.can_select_widget)
			return
		//select_widgets(new Set([fe]))
	}
	*/

	e.on('bind', function(on) {
		document.on('widget_tree_changed', widget_tree_changed, on)
		document.on('selected_widgets_changed', selected_widgets_changed, on)
		//document.on('focusin', focus_changed, on)
	})

})

// ---------------------------------------------------------------------------
// prop layers inspector
// ---------------------------------------------------------------------------

component('x-prop-layers-inspector', function(e) {

	grid.construct(e)
	e.cell_h = 22

	e.can_select_widget = false

	function reset() {
		let rows = []
		for (let slot in xmodule.prop_layer_slots) {
			let layer_obj = xmodule.prop_layer_slots[slot]
			let layer = layer_obj ? layer_obj.name : null
			rows.push([true, slot, layer])
		}
		e.rowset = {
			fields: [
				{name: 'active', type: 'bool', w: 24,
					true_text: () => H('<div class="fa fa-eye" style="font-size: 80%"></div>'),
					false_text: '',
				},
				{name: 'slot', w: 80},
				{name: 'layer', w: 80},
			],
			rows: rows,
		}
		e.reset()
	}

	e.on('bind', reset)

})

// ---------------------------------------------------------------------------
// sql rowset editor
// ---------------------------------------------------------------------------

sql_rowset_editor = component('x-sql-rowset-editor', function(e) {



})

// ---------------------------------------------------------------------------
// sql schema editor
// ---------------------------------------------------------------------------



// ---------------------------------------------------------------------------
// globals list
// ---------------------------------------------------------------------------

function globals_list() {

}

// ---------------------------------------------------------------------------
// toolboxes
// ---------------------------------------------------------------------------

function properties_toolbox(tb_opt, insp_opt) {
	let pg = prop_inspector(insp_opt)
	let tb = toolbox(update({
		text: 'properties',
		content: pg,
		can_select_widget: false,
	}, tb_opt))
	tb.inspector = pg
	pg.on('prop_inspector_changed', function() {
		tb.text = pg.title_text + ' properties'
	})
	return tb
}

function widget_tree_toolbox(tb_opt, wt_opt) {
	let wt = widget_tree(wt_opt)
	let tb = toolbox(update({
		text: 'widget tree',
		content: wt,
		can_select_widget: false,
	}, tb_opt))
	tb.tree = wt
	return tb
}

function prop_layers_toolbox(tb_opt, insp_opt) {
	let pg = prop_layers_inspector(insp_opt)
	let tb = toolbox(update({
		text: 'property layers',
		content: pg,
		can_select_widget: false,
	}, tb_opt))
	tb.inspector = pg
	return tb
}

// ---------------------------------------------------------------------------
// dialogs
// ---------------------------------------------------------------------------

function sql_rowset_editor_dialog() {
	let ed = sql_rowset_editor()
	let d = dialog({
		text: 'SQL Rowset Editor',
		content: ed,
		footer: '',
	})
	d.editor = ed
	return d
}

