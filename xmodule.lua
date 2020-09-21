
require'xrowset'
local path = require'path'
local fs = require'fs'
local ppjson = require'prettycjson' --TODO: this is broken.

--rowsets --------------------------------------------------------------------

local rowsets = virtual_rowset(function(rs)
	function rs:select_rows(res, param_values)
		res.fields = {
			{name = 'name'},
		}
		res.pk = {'name'}
		res.rows = {}
		for name, rs in sortedpairs(rowset) do
			add(res.rows, {name})
		end
	end
end)

function rowset.rowsets()
	return rowsets:respond()
end

--xmodule --------------------------------------------------------------------

function xmodule_file(file)
	return path.combine(config'app_dir', file)
end

local xmodule_ns = config('xmodule_ns', '')
assert(not xmodule_ns:find(' ', 1, true))

function action.xmodule_next_gid()
	local fn = xmodule_file'xmodule-next-gid'
	local id = tonumber(assert(readfile(fn)))
	if method'post' then
		assert(writefile(fn, tostring(id + 1), nil, fn..'.tmp'))
	end
	setmime'txt'
	out(xmodule_ns..id)
end

action['xmodule_layer.json'] = function(layer)
	layer = check(str_arg(layer))
	assert(layer:find'^[%w_%-]+$')
	local fn = _('xmodule-%s.json', layer)
	local file = xmodule_file(fn)
	if not fs.is(file) then
		file = fn
	end

	if method'post' then
		writefile(file, post())
	else
		return readfile(file) or '{}'
	end
end

action['sql_rowset.json'] = function(gid, ...)
	local layer = json(check(readfile(xmodule_file'xmodule-base-server-lma.json')))
	local t = check(layer[gid])
	local rs = {}
	for k,v in pairs(t) do
		if k:starts'sql_' then
			rs[k:sub(5)] = v
		end
	end
	return sql_rowset(rs):respond()
end

