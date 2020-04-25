
--Server-side rowset counterpart for x-widgets rowsets.
--Written by Cosmin Apreutesei. Public Domain.

require'mysql_h'

rowset = {}

action['rowset.json'] = function(name, ...)
	return check(rowset[name])(...)
end

--[=[
local function field_defs_from_columns_table(tables)
	local where = {}
	for _,t in ipairs(tables) do
		if #where > 0 then
			add(where, '\n\t\t\tor ')
		end
		append(where,
			'(c.table_schema = ', quote_sql(t[1]),
			' and c.table_name = ', quote_sql(t[2]), ' and (')
		for i = 3, #t do
			if i > 3 then
				add(where, ' or ')
			end
			add(where, 'c.column_name = ')
			add(where, quote_sql(t[i]))
		end
		add(where, '))')
	end
	print_queries(true)
	for i,row in ipairs(query([[
		select
			c.column_name,
			c.column_default,
			c.is_nullable,
			c.data_type,
			c.character_maximum_length,
			c.numeric_precision,
			c.numeric_scale,
			c.datetime_precision,
			c.character_set_name,
			c.extra, --auto_increment, on update ...
			c.is_generated
		from
			columns c
		where
			]]..concat(where))
	) do
		pp(row)
	end
end
]=]

local mysql_types = {
	[C.MYSQL_TYPE_DECIMAL    ] = 'number',
	[C.MYSQL_TYPE_TINY       ] = 'boolean',
	[C.MYSQL_TYPE_SHORT      ] = 'number',
	[C.MYSQL_TYPE_LONG       ] = 'number',
	[C.MYSQL_TYPE_FLOAT      ] = 'number',
	[C.MYSQL_TYPE_DOUBLE     ] = 'number',
	[C.MYSQL_TYPE_TIMESTAMP  ] = 'datetime',
	[C.MYSQL_TYPE_LONGLONG   ] = 'number',
	[C.MYSQL_TYPE_INT24      ] = 'number',
	[C.MYSQL_TYPE_DATE       ] = 'date',
	[C.MYSQL_TYPE_TIME       ] = 'time',
	[C.MYSQL_TYPE_DATETIME   ] = 'datetime',
	[C.MYSQL_TYPE_YEAR       ] = 'number',
	[C.MYSQL_TYPE_NEWDATE    ] = 'date',
	[C.MYSQL_TYPE_VARCHAR    ] = 'text',
	[C.MYSQL_TYPE_TIMESTAMP2 ] = 'datetime',
	[C.MYSQL_TYPE_DATETIME2  ] = 'datetime',
	[C.MYSQL_TYPE_TIME2      ] = 'time',
	[C.MYSQL_TYPE_NEWDECIMAL ] = 'number',
	[C.MYSQL_TYPE_ENUM       ] = 'enum',
	--[C.MYSQL_TYPE_SET        ] = '',
	[C.MYSQL_TYPE_TINY_BLOB  ] = 'file',
	[C.MYSQL_TYPE_MEDIUM_BLOB] = 'file',
	[C.MYSQL_TYPE_LONG_BLOB  ] = 'file',
	[C.MYSQL_TYPE_BLOB       ] = 'file',
	--[C.MYSQL_TYPE_VAR_STRING ] = '',
	--[C.MYSQL_TYPE_STRING     ] = '',
	--[C.MYSQL_TYPE_GEOMETRY   ] = '',
}

local mysql_range = {
	--[C.MYSQL_TYPE_DECIMAL    ] = {},
	[C.MYSQL_TYPE_TINY       ] = {-127, 127, 0, 255},
	[C.MYSQL_TYPE_SHORT      ] = {-32768, 32767, 0, 65535},
	[C.MYSQL_TYPE_LONG       ] = {},
	--[C.MYSQL_TYPE_FLOAT      ] = {},
	--[C.MYSQL_TYPE_DOUBLE     ] = {},
	[C.MYSQL_TYPE_LONGLONG   ] = {},
	[C.MYSQL_TYPE_INT24      ] = {-2^23, 2^23-1, 0, 2^24-1},
	--[C.MYSQL_TYPE_NEWDECIMAL ] = {},
}

local mysql_charsize = {
	[33] = 3, --utf8
	[45] = 4, --utf8mb4
}

local function field_defs_from_query_result_cols(cols, extra_defs, update_table)
	local t, pk, id_col = {}, {}
	for i,col in ipairs(cols) do
		local field = {}
		field.name = col.name
		local type = mysql_types[col.type]
		field.type = type
		field.allow_null = col.allow_null
		if col.auto_increment then
			field.editable = false
			field.is_id = true
			if col.orig_table == update_table then
				id_col = col.name
			end
		end
		if type == 'number' then
			local range = mysql_range[col.type]
			if range then
				field.min = range[1 + (col.unsigned and 2 or 0)]
				field.max = range[2 + (col.unsigned and 2 or 0)]
			end
			field.multiple_of = 1 / 10^col.decimals
		elseif not type then
			field.maxlen = col.length * (mysql_charsize[col.charsetnr] or 1)
		end
		t[i] = update(field, extra_defs and extra_defs[col.name])
		if col.pri_key or col.unique_key then
			add(pk, col.name)
		end
	end
	return t, pk, id_col
end

local function parse_fields(s)
	if type(s) ~= 'string' then
		return s
	end
	local t = {}
	for s in s:gmatch'[^%s]+' do
		t[#t+1] = s
	end
	return t
end

local function where_sql(pk, suffix)
	local t = {'where '}
	for i,k in ipairs(pk) do
		append(t, quote_sqlname(k), ' <=> ', ':', k, suffix or '', ' and ')
	end
	t[#t] = nil --remove the last ' and '.
	return concat(t)
end

local function insert_sql(tbl, fields, values)
	local t = {'insert into ', quote_sqlname(tbl), ' set '}
	for _,k in ipairs(fields) do
		local v = values[k]
		if v ~= nil then
			append(t, quote_sqlname(k), ' = ', quote_sql(v), ', ')
		end
	end
	if t[#t] == ' set ' then --no fields.
		t[#t] = ' values ()'
	else
		t[#t] = nil --remove the last ',  '.
	end
	return concat(t)
end

local function update_sql(tbl, fields, where_sql, values)
	local t = {'update ', quote_sqlname(tbl), ' set '}
	for _,k in ipairs(fields) do
		local v = values[k]
		if v ~= nil then
			append(t, quote_sqlname(k), ' = ', quote_sql(v), ', ')
		end
	end
	t[#t] = ' ' --replace the last comma.
	add(t, (quote_sqlparams(where_sql, values)))
	return concat(t)
end

local function delete_sql(tbl, where_sql, values)
	return concat{'delete from ', quote_sqlname(tbl), ' ',
		(quote_sqlparams(where_sql, values))}
end

function sql_rowset(sql, ...)

	local rs = {}

	rs.can_edit = true
	rs.can_add_rows = true
	rs.can_remove_rows = true
	rs.can_change_rows = true

	function rs:load(param_values)

		local t, cols, params = query_on(rs.db, rs.select, param_values)
		local fields, pk, id_col =
			field_defs_from_query_result_cols(cols, t.field_attrs, rs.update_table)
		local rows = {}
		for i,row in ipairs(t) do
			rows[i] = {values = row}
		end

		return {
			can_edit = rs.can_edit,
			can_add_rows = rs.can_add_rows,
			can_remove_rows = rs.can_remove_rows,
			can_change_rows = rs.can_change_rows,

			fields = fields,
			pk = rs.pk or pk,
			id_col = rs.id_col or id_col,
			rows = rows,
			params = rs.params or params,
		}
	end

	function rs:apply_changes(changes)
		local res = {new_rows = {}, updated_rows = {}, removed_rows = {}}

		for _,row in ipairs(changes.new_rows) do
			local rt = {}
			if rs.can_add_rows then
				local t = rs.insert_row(row)
				local id = t.insert_id ~= 0 and t.insert_id
				if id then
					assert(changes.id_col)
					row[changes.id_col] = id
				end
				if t.affected_rows == 0 then
					rt.error = 'new row was not added'
				elseif rs.select_row then
					rt.values = rs.select_row(row)
					if not rt.values then
						rt.error = 'new row was not found after insert'
					end
				else
					rt.values = id and {[changes.id_col] = t.insert_id}
					rt.partial = true
				end
			else
				rt.error = 'cannot add rows'
			end
			add(res.new_rows, rt)
		end

		for _,row in ipairs(changes.updated_rows) do
			local rt = {}
			if rs.can_change_rows then
				local t = rs.update_row(row)
				if t.affected_rows == 0 then
					rt.error = 'row was not updated'
				elseif rs.select_row_update then
					rt.values = rs.select_row_update(row)
					if not rt.values then
						rt.remove = true
						rt.error = 'updated row was not found after update'
					end
				end
			else
				rt.error = 'cannot update rows'
			end
			add(res.updated_rows, rt)
		end

		for _,row in ipairs(changes.removed_rows) do
			local rt = {}
			if rs.can_remove_rows then
				local t = rs.delete_row(row)
				if t.affected_rows == 0 then
					rt.error = 'row was not removed'
				else
					rt.values = rs.select_row and rs.select_row(row)
					if rt.values then
						rt.put_back = true
						rt.error = 'removed row is still there'
					else
						rt.remove = true --avoid making this a json array.
					end
				end
			else
				rt.put_back = true
				rt.error = 'cannot remove rows'
			end
			add(res.removed_rows, rt)
		end

		return res
	end

	function rs:respond()
		if method'post' then
			return rs:apply_changes(post())
		else
			return rs:load(json(args'params'))
		end
	end

	if type(sql) == 'string' then
		rs.select = sql
	else
		update(rs, sql, ...)
	end

	rs.update_fields = parse_fields(rs.update_fields)
	rs.pk = parse_fields(rs.pk)

	if not rs.where_row and rs.pk then
		rs.where_row = where_sql(rs.pk)
	end
	if not rs.where_row_update and rs.pk then
		rs.where_row_update = where_sql(rs.pk, ':old')
	end

	if not rs.select_one and rs.select_all and rs.where_row then
		rs.select_one = rs.select_all .. ' ' .. rs.where_row
	end
	if not rs.select_one_update and rs.select_all and rs.where_row_update then
		rs.select_one_update = rs.select_all .. ' ' .. rs.where_row_update
	end
	if not rs.select and rs.select_all then
		rs.select = rs.select_all .. (rs.where and ' ' .. rs.where or '')
	end
	rs.insert_fields = rs.insert_fields or rs.update_fields

	assert(rs.select)

	if rs.update_table and rs.insert_fields then
		function rs.insert_row(row)
			return query(insert_sql(rs.update_table, rs.insert_fields, row))
		end
	end

	if rs.update_table and rs.update_fields and rs.where_row_update then
		function rs.update_row(row)
			return query(update_sql(rs.update_table, rs.update_fields, rs.where_row_update, row), row)
		end
	end

	if rs.update_table and rs.where_row then
		function rs.delete_row(row)
			return query(delete_sql(rs.update_table, rs.where_row, row))
		end
	end

	if rs.select_one then
		function rs.select_row(row)
			return query1(rs.select_one, row)
		end
	end

	if rs.select_one_update then
		function rs.select_row_update(row)
			return query1(rs.select_one_update, row)
		end
	end

	if not rs.insert_row then rs.can_add_rows    = false end
	if not rs.update_row then rs.can_change_rows = false end
	if not rs.delete_row then rs.can_remove_rows = false end

	return rs
end

--testing --------------------------------------------------------------------

local function send_slowly(s, dt)
	setheader('content-length', #s)
	local n = floor(#s * .1 / dt)
	while #s > 0 do
		out(s:sub(1, n))
		flush()
		sleep(.1)
		s = s:sub(n+1)
	end
end

action['ajax_test.txt'] = function()
	local s = 'There\'s no scientific evidence that life is important\n'
	local n = 5
	local z = 1
	sleep(1) --triggers `slow` event.
	setheader('content-length', #s * z * n)
	--^^comment to trigger chunked encoding (no progress in browser).
	--ngx.status = 500
	--^^uncomment see how browsers handles slow responses with non-200 codes.
	for i = 1, n do
		for i = 1, z do
			out(s)
		end
		flush(true)
		sleep(.5)
		--return
		--^^uncomment to trigger a timeout, if content_length is set.
	end
end

action['ajax_test.json'] = function()
	local t = post()
	t.a = t.a * 2
	out_json(t)
end

function rowset.test_static()
	if method'post' then
		--
	else
		local rows = {}
		for i = 1, 1e5 do
			rows[i] = {values = {i, 'Row '..i, 0}}
		end
		local t = {
			fields = {
				{name = 'id', type = 'number'},
				{name = 'name'},
				{name = 'date', type = 'date'},
			},
			rows = rows,
		}
		return t
		--sleep(5)
		--send_slowly(json(t), 1)
	end
end

function rowset.test_query()

	query'create database if not exists rowset_test'
	query'use rowset_test'
	query[[
		create table if not exists rowset_test (
			id int not null auto_increment primary key,
			name varchar(200)
		)
	]]

	return sql_rowset{
		select_all = 'select * from rowset_test',
		update_table = 'rowset_test',
		update_fields = 'name',
		pk = 'id',
	}:respond()

end

