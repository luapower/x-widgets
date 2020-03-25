/*
	Button Widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

button = component('x-button', HTMLButtonElement, 'button', function(e) {

	e.class('x-widget')
	e.class('x-button')

	e.icon_span = H.span({class: 'x-button-icon'})
	e.text_span = H.span({class: 'x-button-text'})
	e.add(e.icon_span, e.text_span)

	e.init = function() {

		e.icon_span.add(e.icon)
		e.icon_span.classes = e.icon_classes

		// can't use CSS for this because margins don't collapse with paddings.
		if (!(e.icon_classes || e.icon))
			e.icon_span.hide()

		e.on('click', e.click)
	}

	e.property('text', function() {
		return e.text_span.innerHTML
	}, function(s) {
		e.text_span.innerHTML = s
	})

	e.css_property('primary')

	e.detach = function() {
		e.fire('detach') // for auto-closing attached popup menus.
	}

})

