/*
	Calendar widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

function month_names() {
	let a = []
	for (let i = 0; i <= 11; i++)
		a.push(month_name(utctime(0, i), 'short'))
	return a
}

calendar = component('x-calendar', function(e) {

	e.class('x-widget')
	e.class('x-calendar')

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
	e.weekview = H.table({class: 'x-calendar-weekview x-focusable', tabindex: 0})
	e.weekview.on('keydown', weekview_keydown)
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
			this.fire('value_changed', t) // dropdown protocol
			update_view()
		}
	)

	// view

	function update_view() {
		let t = e.value
		update_weekview(t, 6)
		let y = year_of(t)
		let n = floor(1 + days(t - month(t)))
		e.sel_day.innerHTML = n
		let day_suffixes = ['', 'st', 'nd', 'rd']
		e.sel_day_suffix.innerHTML = locale.starts('en') ?
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
					td.date = d
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
		e.value = this.date
		e.sel_month.cancel()
		e.weekview.focus()
		e.fire('value_picked', true) // dropdown protocol
		return false // prevent bubbling up to dropdown.
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

	function weekview_keydown(key) {
		let d
		switch (key) {
			case 'ArrowLeft'  : d = -1; break
			case 'ArrowRight' : d =  1; break
			case 'ArrowUp'    : d = -7; break
			case 'ArrowDown'  : d =  7; break
		}
		if (d) {
			e.value = day(e.value, d)
			return false
		}
		if (key == 'Enter') {
			e.fire('value_picked', true) // dropdown protocol
			return false
		}
	}

	// dropdown protocol

	e.focus = function() {
		e.weekview.focus()
	}

	e.property('display_value', function() {
		_d.setTime(e.value)
		return _d.toLocaleString(locale, e.format)
	})

	e.pick_value = function(v) {
		e.value = v
		e.fire('value_picked', false)
	}

	e.pick_near_value = function(delta) {
		e.value = day(e.value, delta)
		e.fire('value_picked', false)
	}

})
