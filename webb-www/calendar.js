/*
	Calendar Widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

calendar = component('x-calendar', function(e, t) {

	e.format = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }

	function init() {
		create_view()
	}

	// model

	let value = now()

	function get_value() { return value; }

	function set_value(t) {
		t = day(t != null ? t : now())
		if (t != t)
			return
		value = t
		update_view()
		this.fire('value_changed', t) // dropdown protocol
	}

	property(e, 'value', {get: get_value, set: set_value})

	// view

	function validate_year(v) {
		let y = Number(v)
		return y >= 1970 && y <= 2200 || 'Year must be between 1970 and 2200'
	}

	function create_view() {
		e.class('x-widget')
		e.class('x-calendar')
		e.sel_day = H.div({class: 'x-calendar-sel-day'})
		e.sel_day_suffix = H.div({class: 'x-calendar-sel-day-suffix'})
		e.sel_month = input({classes: 'x-calendar-sel-month'})
		e.sel_year = spin_input({
				classes: 'x-calendar-sel-year',
				validate: validate_year,
				button_style: 'left-right',
		})
		e.sel_month.input.on('input', month_changed)
		e.sel_year.input.on('input', year_changed)
		e.header = H.div({class: 'x-calendar-header'},
			e.sel_day, e.sel_day_suffix, e.sel_month, e.sel_year)
		e.weekview = H.table({class: 'x-calendar-weekview', tabindex: 0})
		e.weekview.on('keydown', weekview_keydown)
		e.weekview.on('wheel', weekview_wheel)
		e.add(e.header, e.weekview)
	}

	function update_view() {
		let t = e.value
		update_weekview(t, 6)
		let y = year_of(t)
		let n = floor(1 + days(t - month(t)))
		e.sel_day.innerHTML = n
		let day_suffixes = ['', 'st', 'nd', 'rd']
		e.sel_day_suffix.innerHTML = locale.starts('en') ?
			(n < 11 || n > 13) && day_suffixes[n % 10] || 'th' : ''
		e.sel_month.value = month_name(t, 'long')
		e.sel_year.value = y
	}

	function update_weekview(d, weeks) {
		let today = day(now())
		let this_month = month(d)
		d = week(this_month)
		e.weekview.innerHTML = ''
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
					s = s + (d == e.value ? ' selected' : '')
					let td = H.td({class: 'x-calendar-day'+s}, floor(1 + days(d - m)))
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
		e.fire('value_picked') // dropdown protocol
		return false // prevent bubbling to dropdown.
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
			e.fire('value_picked') // dropdown protocol
			return false
		}
	}

	// dropdown protocol

	e.focus = function() {
		e.weekview.focus()
	}

	property(e, 'display_value', {get: function() {
		_d.setTime(e.value)
		return _d.toLocaleString(locale, e.format)
	}})

	e.pick_value = function(v) {
		e.value = v
		e.fire('value_picked')
	}

	e.pick_near_value = function(delta) {
		e.value = day(e.value, delta)
		e.fire('value_picked')
	}

	init()
})
