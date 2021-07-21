
--Server-side rowsets for nav-based x-widgets.
--Written by Cosmin Apreutesei. Public Domain.

require'webb'
local errors = require'errors'

local catch = errors.catch
local raise = errors.raise

rowset = {}

action['rowset.json'] = function(name)
	return check(rowset[name])()
end

field_name_attrs = {}
field_type_attrs = {}

function virtual_rowset(init, ...)

	local rs = {}
	setmetatable(rs, rs)

	rs.can_edit = true
	rs.can_add_rows = true
	rs.can_remove_rows = true
	rs.can_change_rows = true

	function rs:load(param_values)
		local res = {
			can_edit = rs.can_edit,
			can_add_rows = rs.can_add_rows,
			can_remove_rows = rs.can_remove_rows,
			can_change_rows = rs.can_change_rows,
			fields = rs.fields,
			pk = rs.pk,
			id_col = rs.id_col,
			index_col = rs.index_col,
			cols = rs.cols,
			params = rs.params,
			parent_col = rs.parent_col,
			name_col = rs.name_col,
			tree_col = rs.tree_col,
		}
		rs:load_rows(res, param_values)

		local hide_fields = glue.index(glue.names(rs.hide_fields) or glue.empty)
		for i,field in ipairs(res.fields) do
			if hide_fields[field.name]
				or field.name == res.index_col
				or field.name == res.id_col
				--or field.name ==
			then
				field.hidden = true
			end
			if field.name == rs.parent_col then
				field.visible = false
			end
			update(field,
				field_name_attrs[field.name],
				field_type_attrs[field.type],
				rs.field_attrs and rs.field_attrs[field.name]
			)
		end


		return res
	end

	function rs:validate_field(name, val)
		local validate = rs.validators and rs.validators[name]
		if validate then
			return validate(val)
		end
	end

	function rs:validate_fields(values)
		local errors
		for k,v in sortedpairs(values) do --TODO: get these pre-sorted in UI order!
			local err = rs:validate_field(k, v)
			if type(err) == 'string' then
				errors = errors or {}
				errors[k] = err
			end
		end
		return errors
	end

	local function db_error(err, s)
		return config'hide_errors' and s or s..'\n'..err.message
	end

	function rs:can_add_row(values)
		if not rs.can_add_rows then
			return false, 'adding rows not allowed'
		end
		local errors = rs:validate_fields(values)
		if errors then return false, nil, errors end
	end

	function rs:can_change_row(values)
		if not rs.can_change_rows then
			return false, 'updating rows not allowed'
		end
		local errors = rs:validate_fields(values)
		if errors then return false, nil, errors end
	end

	function rs:can_remove_row(values)
		if not rs.can_remove_rows then
			return false, 'removing rows not allowed'
		end
	end

	function rs:apply_changes(changes)

		local res = {rows = {}}

		for _,row in ipairs(changes.rows) do
			local rt = {type = row.type}
			if row.type == 'new' then
				local can, err, field_errors = rs:can_add_row(row.values)
				if can ~= false then
					local ok, affected_rows, id = catch('db', rs.insert_row, rs, row.values)
					if ok then
						if (affected_rows or 1) == 0 then
							rt.error = S('row_not_inserted', 'row not inserted')
						else
							if rs.load_row then
								local ok, values = catch('db', rs.load_row, rs, row.values)
								if ok then
									if values then
										rt.values = values
									else
										rt.error = S('inserted_row_not_found',
											'inserted row could not be loaded back')
									end
								else
									local err = values
									rt.error = db_error(err,
										S('load_inserted_row_error',
											'db error on loading back inserted row'))
								end
							end
						end
					else
						local err = affected_rows
						rt.error = db_error(err,
							S('insert_error', 'db error on inserting row'))
					end
				else
					rt.error = err or true
					rt.field_errors = field_errors
				end
			elseif row.type == 'update' then
				local can, err, field_errors = rs:can_change_row(row.values)
				if can ~= false then
					local ok, affected_rows = catch('db', rs.update_row, rs, row.values)
					if ok then
						if rs.load_row then
							local ok, values = catch('db', rs.load_row, rs, row.values)
							if ok then
								if values then
									rt.values = values
								else
									rt.remove = true
									rt.error = S('updated_row_not_found',
										'updated row could not be loaded back')
								end
							else
								local err = values
								rt.error = db_error(err,
									S('load_updated_row_error',
										'db error on loading back updated row'))
							end
						end
					else
						local err = affected_rows
						rt.error = db_error(err, S('update_error', 'db error on updating row'))
					end
				else
					rt.error = err or true
					rt.field_errors = field_errors
				end
			elseif row.type == 'remove' then
				local can, err, field_errors = rs:can_remove_row(row.values)
				if can ~= false then
					local ok, affected_rows = catch('db', rs.delete_row, rs, row.values)
					if ok then
						if (affected_rows or 1) == 0 then
							rt.error = S('row_not_removed', 'row not removed')
						else
							if rs.load_row then
								local ok, values = catch('db', rs.load_row, rs, row.values)
								if ok then
									if values then
										rt.error = S('rmeoved_row_found',
											'removed row is still in db')
									end
								else
									local err = values
									rt.error = db_error(err,
										S('load_removed_row_error',
											'db error on loading back removed row'))
								end
							end
						end
					else
						local err = affected_rows
						rt.error = db_error(err,
							S('delete_error', 'db error on removing row'))
					end
				else
					rt.error = err or true
					rt.field_errors = field_errors
				end
				rt.remove = not rt.error
			else
				assert(false)
			end
			add(res.rows, rt)
		end

		return res
	end

	function rs:respond()
		local filter = json_arg(args'filter') or {}
		local params = {}
		params.lang = lang()
		local t = {}
		for k,v in pairs(params) do
			t['param:'..k] = v
		end
		params.filter = filter
		if method'post' then
			local changes = post()
			for _,row_change in ipairs(changes.rows) do
				if row_change.values then
					update(row_change.values, t)
				end
			end
			return rs:apply_changes(changes)
		else
			return rs:load(params)
		end
	end

	init(rs, ...)

	if not rs.insert_row then rs.can_add_rows    = false end
	if not rs.update_row then rs.can_change_rows = false end
	if not rs.delete_row then rs.can_remove_rows = false end

	rs.__call = rs.respond

	return rs
end

--S translation rowset -------------------------------------------------------

do

local files = {}
local ids --{id->{files=,n=,en_s}}

function Sfile(filenames)
	for _,file in ipairs(glue.names(filenames)) do
		files[file] = true
	end
	ids = nil
end

local function get_ids()
	if not ids then
		ids = {}
		for file in pairs(files) do
			local ext = fileext(file)
			assert(ext == 'lua' or ext == 'js')
			local s = assert(readfile(file))
			for id, en_s in s:gmatch"[^%w_]S%(%s*'([%w_]+)'%s*,%s*'(.-)'%s*[,%)]" do
				local ext_id = ext..':'..id
				local t = ids[ext_id]
				if not t then
					t = {files = file, n = 1, en_s = en_s}
					ids[ext_id] = t
				else
					t.files = t.files .. ' ' .. file
					t.n = t.n + 1
				end
			end
		end
	end
	return ids
end

rowset.S = virtual_rowset(function(self, ...)

	self.fields = {
		{name = 'ext'},
		{name = 'id'},
		{name = 'en_text'},
		{name = 'text'},
		{name = 'files'},
		{name = 'occurences', type = 'number', max_w = 30},
	}
	self.pk = 'ext id'
	self.cols = 'id en_text text'
	function self:load_rows(rs, params)
		rs.rows = {}
		local lang = params.lang
		for ext_id, t in pairs(get_ids()) do
			local ext, id = ext_id:match'^(.-):(.*)$'
			local s = S_texts(lang, ext)[id]
			add(rs.rows, {ext, id, t.en_s, s, t.files, t.n})
		end
	end

	local function update_key(vals)
		local ext  = check(json_str_arg(vals['ext:old']))
		local id   = check(json_str_arg(vals['id:old']))
		local lang = check(json_str_arg(vals['param:lang']))
		return ext, id, lang
	end

	function self:update_row(vals)
		local ext, id, lang = update_key(vals)
		local text = json_str_arg(vals.text)
		update_S_texts(lang, ext, {[id] = text or false})
	end

	function self:load_row(vals)
		local ext, id, lang = update_key(vals)
		local t = get_ids()[ext..':'..id]
		if not t then return end
		local s = S_texts(lang, ext)[id]
		return {ext, id, t.en_s, s, t.files, t.n}
	end

end)

end --files

