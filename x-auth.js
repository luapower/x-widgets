
function set_night_mode(v) {
	document.body.attr('theme', v ? 'dark' : null)
	document.fire('theme_changed', v ? 'dark' : null)
}

function init_user_settings_nav(module) {

	let set = {}

	set.night_mode = function(v) {
		set_night_mode(v)
	}

	let nav = bare_nav({
		id: module+'_user_settings_nav',
		module: module,
		static_rowset: {
			fields: [
				{
					name: 'night_mode', type: 'bool', default: false,
					text: S('night_mode', 'Night Mode'),
				},
			],
		},
		row_vals: [{
			night_mode: false,
		}],
		props: {row_vals: {slot: 'user'}},
		save_row_on: 'input',
	})
	body.add(nav)

	function set_all() {
		for (let field of nav.all_fields)
			set[field.name](nav.cell_val(nav.focused_row, field))
	}

	nav.on('reset', set_all)

	nav.on('focused_row_cell_val_changed', function(field, v) {
		set[field.name](v)
	})

	nav.on('saved', function() {
		if (!window.xmodule)
			return
		xmodule.save()
	})

	set_all()

	return nav
}

let settings_nav

window.on('load', function() {
	let module = $('x-settings-button')[0].module
	settings_nav = init_user_settings_nav(module)
})

component('x-settings-button', function(e) {

	button.construct(e)

	e.xoff()
	e.bare = true
	e.text = ''
	e.icon = 'fa fa-cog'
	e.xon()

	let tt

	e.on('activate', function() {

		if (tt && tt.target) {

			tt.close()

		} else {

			let night_mode = checkbox({
				nav: settings_nav,
				col: 'night_mode',
				button_style: 'toggle',
				autoclose: true,
			})

			night_mode.on('val_changed', function(v) {
				set_night_mode(v)
			})

			let sign_in_button = button({
				text: S('button_text_sign_in', 'Sign-In'),
				action: () => { tt.close(); sign_in(); },
			})

			let settings_form = div({style: `
					display: flex;
					flex-flow: column;
				`},
				night_mode,
				sign_in_button,
			)

			tt = tooltip({
				classes: 'x-settings-tooltip',
				target: e, side: 'bottom', align: 'end',
				text: settings_form,
				close_button: true,
				autoclose: true,
			})

		}

	})

})

// sign-in form --------------------------------------------------------------

let sign_in_dialog = memoize(function() {

	let e = unsafe_html(render('sign_in_dialog'))

	e.slides       = e.$1('.sign-in-page')
	e.email_edit   = e.$1('.sign-in-email-edit')
	e.code_edit    = e.$1('.sign-in-code-edit')
	e.email_button = e.$1('.sign-in-email-button')
	e.code_button  = e.$1('.sign-in-code-button')

	e.email_edit.field = {not_null: true}
	e.code_edit.field = {not_null: true}

	e.email_button.action = function() {
		let d = sign_in_dialog()
		e.email_button.post(href('/sign-in-email.json'), {
			email: e.email_edit.val,
		}, function() {
			sign_in_code()
		}, function(err) {
			e.email_edit.errors = [{message: err, passed: false}]
			e.email_edit.focus()
		})
	}

	e.code_button.action = function() {
		let d = sign_in_dialog()
		e.code_button.post(href('/login.json'), {
			type: 'code',
			code: e.code_edit.val,
		}, function(s) {
			if (location.pathname.starts('/sign-in'))
				exec('/')
			else
				e.close()
		}, function(err) {
			e.code_edit.errors = [{message: err, passed: false}]
			e.code_edit.focus()
		})
	}

	return e
})

flap.sign_in = function(on) {
	let d = sign_in_dialog()
	if (on) {
		d.modal()
	} else if (d) {
		d.close()
	}
}

function sign_in() {
	setflaps('sign_in')
	let d = sign_in_dialog()
	d.email_edit.errors = null
	d.slides.slide(0)
}

function sign_in_code() {
	setflaps('sign_in')
	let d = sign_in_dialog()
	d.code_edit.errors = null
	d.slides.slide(1)
}

action.sign_in = sign_in
action.sign_in_code = sign_in_code

function init_auth() {
	post(href('/login.json'), {}, function(usr) {
		broadcast('usr_changed', usr)
	}, function(err) {
		notify(err, 'error')
	})
}

