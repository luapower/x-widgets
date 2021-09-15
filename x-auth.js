
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
				action: () => { tt.close(); exec('/sign-in'); },
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

// 'firstname lastname' -> 'firstname'; 'email@domain' -> 'email'
function firstname(name, email) {
	if (name) {
		name = name.trim()
		var a = name.split(' ', 1)
		return a.length > 0 ? a[0] : name
	} else if (email) {
		email = email.trim()
		var a = email.split('@', 1)
		return a.length > 0 ? a[0] : email
	} else {
		return ''
	}
}

action.sign_in = function() {
	sign_in_email_edit.errors = null
	sign_in_page_slides.slide(0)
}

action.sign_in_code = function() {
	sign_in_code_edit.errors = null
	sign_in_page_slides.slide(1)
}

flap.sign_in = function(on) {
	sign_in_page_slides.show(on)
	if (!on)
		sign_in_page_slides.slide(0)
}

document.on('sign_in_email_edit.init', function(e) {
	e.field = {not_null: true}
})

document.on('sign_in_code_edit.init', function(e) {
	e.field = {not_null: true}
})

document.on('sign_in_email_button.init', function(e) {
	e.action = function() {
		post(href('/sign-in-email.json'), {
			email: sign_in_email_edit.val,
		}, function() {
			exec('/sign-in-code')
		}, function(err) {
			sign_in_email_edit.errors = [{message: err, passed: false}]
			sign_in_email_edit.focus()
		})
	}
})

document.on('sign_in_code_button.init', function(e) {
	e.action = function() {
		post(href('/login.json'), {
			type: 'code',
			code: sign_in_code_edit.val,
		}, function(s) {
			exec('/account')
		}, function(err) {
			sign_in_code_edit.errors = [{message: err, passed: false}]
			sign_in_code_edit.focus()
		})
	}
})

function init_auth() {

	post(href('/login.json'), {}, function(usr) {
		broadcast('usr_changed', usr)
	}, function(err) {
		notify(err, 'error')
	})

}

action.sign_in = function() {
	let dialog = unsafe_html(render('sign_in_dialog')).modal()
	dialog.on('close', function() {
		exec('/')
	})
	sign_in_email_edit.errors = null
	sign_in_page_slides.slide(0)
}

