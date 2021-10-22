--[==[

	webb | x-widgets-based apps
	Written by Cosmin Apreutesei. Public Domain.

]==]

local ffi = require'ffi'
ffi.tls_libname = 'tls_bearssl'

require'webb_spa'
require'xrowset_sql'

math.randomseed(require'time'.clock())

js[[

function init() {
	init_components()
	init_auth()
	init_action()
}
on_dom_load(init)

]]

cssfile[[
fontawesome.css
divs.css
x-widgets.css
]]

jsfile[[
markdown-it.js
markdown-it-easy-tables.js
x-widgets.js
x-nav.js
x-input.js
x-listbox.js
x-grid.js
x-module.js
]]

Sfile[[
webb.lua
webb_query.lua
webb_spa.lua
webb_xapp.lua
x-widgets.js
x-nav.js
x-input.js
x-listbox.js
x-grid.js
x-module.js
]]

fontfile'fa-solid-900.ttf'

require'xauth'

return function(app)

	--config ------------------------------------------------------------------

	config('app_name', app_name)
	config('var_dir' , var_dir)
	config('tmp_dir' , tmp_dir)

	Sfile((config'app_name')..'.lua')

	if app.font == 'opensans' then
		fontfile'OpenSans-Regular.ttf'
		fontfile'OpenSans-SemiBold.ttf'
		fontfile'OpenSansCondensed-Light.ttf'
		fontfile'OpenSansCondensed-Bold.ttf'
	end

	--schema ------------------------------------------------------------------

	function cmd.install()
		webb.run(function()
			local schema = config('db_schema', app_name)
			with_config({db_schema = false}, function()
				create_schema(schema)
				use_schema(schema)
				app.install()
			end)
		end)
	end

	--website -----------------------------------------------------------------

	app.respond = glue.noop
	app.spa = glue.noop

	config('main_module', function()
		if not app.respond() then
			checkfound(action(unpack(args())))
		end
	end)

	action['404.html'] = function(action)
		spa(update({
				body = html(),
				body_classes = 'x-container',
				body_attrs = catargs(' ', app.fullscreen, app.font),
				client_action = true,
			}, app.spa(action)))
	end

	--cmdline -----------------------------------------------------------------

	function cmd.start()
		if app.quiet == nil then
			logging.quiet = false
		end
		local server = webb.server(app.server_options)
		server.start()
	end

	return app
end
