/*
	Button Widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

button = component('x-button', HTMLButtonElement, 'button', function(e, t) {

	e.class('x-widget')
	e.class('x-button')
	e.icon_span = H.span({class: 'x-button-icon ' + (t.icon_classes || '')}, t.icon)
	e.text_span = H.span({class: 'x-button-text'})

	if (!(t.icon_classes || t.icon))
		e.icon_span.hide() // can't use CSS because margins don't collapse with paddings.

	e.add(e.icon_span, e.text_span)

	function get_text() {
		return e.text_span.innerHTML
	}

	function set_text(s) {
		e.text_span.innerHTML = s
	}

	property(e, 'text', {get: get_text, set: set_text})

	class_property(e, 'primary')

	e.on('click', t.click)

})

