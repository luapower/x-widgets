--[==[

	x-widgets-based apps
	Written by Cosmin Apreutesei. Public Domain.

]==]

local xapp = {}

local ffi = require'ffi'
ffi.tls_libname = 'tls_bearssl'

require'$'
require'webb_spa'
require'xrowset_sql'

randomseed(require'time'.clock())

cmd = {}

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

function xapp.app(codename)

	local app = {}

	--config ------------------------------------------------------------------

	config('app_codename', codename)
	pcall(require, codename..'_conf')
	Sfile(codename..'.lua')

	if app.font == 'opensans' then
		fontfile'OpenSans-Regular.ttf'
		fontfile'OpenSans-SemiBold.ttf'
		fontfile'OpenSansCondensed-Light.ttf'
		fontfile'OpenSansCondensed-Bold.ttf'
	end

	--schema ------------------------------------------------------------------

	function cmd.install()
		srun(function()
			local schema = config('db_schema', codename)
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
			check(action(unpack(args())))
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

	function cmd.help()
		print'Commands:'
		for k,v in sortedpairs(cmd) do
			print('', k)
		end
	end

	function cmd.start()
		local server = http_server()
		server.start()
	end

	function app.run(...)
		if ... == codename then --loaded with require().
			return app
		else
			--loaded from cmdline: consider this module loaded so that
			--other submodules that require it don't try to load it again.
			package.loaded[codename] = app
		end

		local s = ... or 'help'
		local cmd = s and cmd[s:gsub('-', '_')] or cmd.help
		return cmd(select(2, ...))
	end

	return app
end

return xapp
