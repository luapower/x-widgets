--[==[

	x-widgets-based apps
	Written by Cosmin Apreutesei. Public Domain.

]==]

local xapp = {}

function xapp.app(codename)

	local app = {}

	local ffi = require'ffi'
	ffi.tls_libname = 'tls_bearssl'

	require'$'
	require'webb_spa'
	require'xrowset_sql'

	randomseed(require'time'.clock())

	local cmd = {}
	app.cmd = cmd

	--config ------------------------------------------------------------------

	config('app_codename', codename)
	pcall(require, codename..'_conf')

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

	config('main_module', function()
		check(action(unpack(args())))
	end)

	local head = [[
	<style>

	* { box-sizing: border-box; }

	html, body, table, tr, td, div, img, hr, button {
		margin: 0;
		padding: 0;
		border: 0;
	}

	img {
		display: block; /* don't align to surrounding text */
		max-width: 100%; /* make shrinkable */
	}

	html, body {
		overflow-y: auto; /* fix the most annoying thing */
		width: 100%;
		height: 100%;
	}

	</style>
	]]

	cssfile[[
	fontawesome.css
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

	Sfile(codename..'.lua')

	fontfile'fa-solid-900.ttf'

	action['404.html'] = function(action)
		spa{
			head = head,
			body = app.body,
			body_classes = 'x-container',
			title = app.title,
			--favicon = '/favicon.ico',
			client_action = true,
		}
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
		cmd(select(2, ...))
	end

	return app
end

return xapp
