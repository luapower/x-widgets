
require'webb_spa'
require'webb_auth'
require'xrowset_sql'

jsfile'x-auth.js'
cssfile'x-auth.css'

Sfile'webb_auth.lua'
Sfile'xrowset.lua'
Sfile'xrowset_sql.lua'
Sfile'x-auth.js'
Sfile'xauth.lua'

wwwfile['x-auth.css'] = [[

.x-settings-button {

}

.x-settings-button > .x-button-icon {
	font-size: 1.2em;
}

.sign-in-page {
	align-self: center;
	width: 300px;
}

.sign-in-page .x-button {
	//margin: .25em 0;
}

]]

template.sign_in_dialog = [[
<x-dialog heading="Sign-In">
	<content>
		<x-slides id=sign_in_page_slides class=sign-in-page>

			<div vflex class="x-flex">
				<div class=breadcrumbs>
					Sign-in
				</div>
				<p small>
				The security of your account is our priority.
				So instead having you set up a hard-to-remember password,
				we will send you a one-time activation code every time
				you need to sign in.
				</p>
				<x-textedit id=sign_in_email_edit field_type=email label="Email address"></x-textedit>
				<x-button id=sign_in_email_button>E-mail me a sign-in code</x-button>
			</div>

			<div vflex class="x-flex">
				<div class=breadcrumbs>
					<a href="/sign-in">Sign-in</a> &gt;
					Enter code
				</div>
				An e-mail was sent to you with a 6-digit sign-in code.
				Enter the code below to sign-in.
				<x-textedit id=sign_in_code_edit field_type=sign_in_code label="6-digit sign-in code"></x-textedit>
				<x-button id=sign_in_code_button>Sign-in</x-button>
			</div>

		</x-slides>
	</content>
</x-dialog>
]]

template.sign_in_email = [[

Your sign-in code:

{{code}}

]]

action['login.json'] = function()
	local auth = post()
	allow(login(auth))
	return usr'*'
end

action['sign_in_email.json'] = function()
	local params = post()
	local noreply = config'noreply_email' or email'no-reply'
	local email = check(json_str_arg(params.email),
		S('email_required', 'Email address required'))
	local code = allow(gen_auth_code('email', email))
	log('SIGN-IN', 'email=%s code=%s', email, code)
	local subj = S('sign_in_email_subject', 'Your sign-in code')
	local msg = render('sign_in_email', {code = code, host = host()})
	sendmail(noreply, email, subj, msg)
	return {ok = true}
end

action['sign_in_phone.json'] = function()
	local phone = check(json_str_arg(params.phone),
		S('phone_required', 'Phone number required'))
	local code = allow(gen_auth_code('phone', phone))
	local msg = S('sign_in_sms_message',
		'Your sign-in code for {1} is: {0}', code, host())
	log('SIGN-IN', 'phone=%s code=%s', phone, code)
	sendsms(phone, msg)
	return {ok = true}
end
