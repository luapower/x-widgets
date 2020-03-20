/*
	Pagelist Widget.
	Written by Cosmin Apreutesei. Public Domain.

	--

*/

pagelist = component('x-pagelist', function(e, t) {

	function init() {

		e.class('x-widget')
		e.class('x-pagelist')

		let sel_i = t.selected
		if (t.items)
			for (let i = 0; i < t.items.length; i++) {
				let item = t.items[i]
				if (typeof(item) == 'string')
					item = {text: item}
				let item_div = H.div({class: 'x-pagelist-item', tabindex: 0}, item.text)
				item_div.on('mousedown', item_mousedown)
				item_div.on('keydown'  , item_keydown)
				item_div.item = item
				item_div.index = i
				e.add(item_div)
				if (item.selected)
					sel_i = i
			}
		e.selection_bar = H.div({class: 'x-pagelist-selection-bar'})
		e.add(e.selection_bar)

		e.selected_item = sel_i
	}

	// controller

	e.attach = function() {
		e.selected_item = e.selected_item
	}

	function select_item_div(idiv) {
		if (e.selected_item_div) {
			e.selected_item_div.class('selected', false)
			e.fire('close', e.selected_item_div.index)
			if (e.page_container)
				e.page_container.innerHTML = ''
		}
		e.selection_bar.style.display = idiv ? null : 'none'
		e.selected_item_div = idiv
		if (idiv) {
			idiv.class('selected', true)
			e.selection_bar.x = idiv.offsetLeft
			e.selection_bar.w = idiv.clientWidth
			e.fire('open', idiv.index)
			if (e.page_container) {
				let page = idiv.item.page
				if (page)
					e.page_container.add(page)
			}
		}
	}

	function item_mousedown() {
		select_item_div(this)
		this.focus()
		return false
	}

	function item_keydown(key) {
		if (key == 'Space' || key == 'Enter') {
			select_item_div(this)
			return false
		}
		if (key == 'ArrowRight' || key == 'ArrowLeft') {
			e.selected_item = e.selected_item + (key == 'ArrowRight' ? 1 : -1)
			if (e.selected_item_div)
				e.selected_item_div.focus()
			return false
		}
	}

	// selected_item property.

	function get_sel_item() {
		return e.selected_item_div ? e.selected_item_div.index : null
	}

	function set_sel_item(i) {
		let idiv = e.at[clamp(i, 0, e.children.length-2)]
		if (!idiv)
			return
		select_item_div(idiv)
	}

	property(e, 'selected_item', {get: get_sel_item, set: set_sel_item})

	init()

})
