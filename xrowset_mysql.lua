
--MySQL rowsets.
--Written by Cosmin Apreutesei. Public Domain.

require'xrowset'

local format = string.format
local concat = table.concat
local outdent = glue.outdent

local function colname(sch, tbl, col)
	return format('%s\0%s\0%s', sch:lower(), tbl:lower(), col:lower())
end

local function tblname(sch, tbl)
	return format('%s\0%s', sch:lower(), tbl:lower())
end

local function tblname_arg(s)
	return s:match'^(.-)%z(.*)$'
end

local col_defs = memoize(function(tbls)

	local function parse_enum(s)
		local vals = s:match'^enum%((.-)%)$'
		if not vals then return end
		local t = {}
		vals:gsub("'(.-)'", function(s)
			t[#t+1] = s
		end)
		return t
	end

	local cols = {}

	local where = {}
	for i,tbl in ipairs(glue.names(tbls)) do
		local sch, tbl = tblname_arg(tbl)
		where[i] = sqlparams('(c.table_schema = ? and c.table_name = ?)', {sch, tbl})
	end
	where = concat(where, '\n\t\t\tor ')

	for i,t in ipairs(kv_query([[
		select
			c.table_schema as sch,
			c.table_name as tbl,
			c.column_name as col,
			c.column_type as type,
			c.column_key as ckey
			--c.column_default,
			--c.is_nullable,
			--c.data_type,
			--c.character_maximum_length,
			--c.numeric_precision,
			--c.numeric_scale,
			--c.datetime_precision,
			--c.character_set_name,
			--c.extra,
			--auto_increment, on update ...
			--c.is_generated
		from
			information_schema.columns c
		where
			{where}
		]], {where = where}))
	do
		local enum_values = parse_enum(t.type)
		cols[colname(t.sch, t.tbl, t.col)] = {
			type = enum_values and 'enum' or nil,
			enum_values = enum_values,
			pk = t.ckey == 'PRI' or nil,
		}
	end

	return cols
end)

local MYSQL_TYPE_DECIMAL     =   0
local MYSQL_TYPE_TINY        =   1
local MYSQL_TYPE_SHORT       =   2
local MYSQL_TYPE_LONG        =   3
local MYSQL_TYPE_FLOAT       =   4
local MYSQL_TYPE_DOUBLE      =   5
local MYSQL_TYPE_NULL        =   6
local MYSQL_TYPE_TIMESTAMP   =   7
local MYSQL_TYPE_LONGLONG    =   8
local MYSQL_TYPE_INT24       =   9
local MYSQL_TYPE_DATE        =  10
local MYSQL_TYPE_TIME        =  11
local MYSQL_TYPE_DATETIME    =  12
local MYSQL_TYPE_YEAR        =  13
local MYSQL_TYPE_NEWDATE     =  14
local MYSQL_TYPE_VARCHAR     =  15
local MYSQL_TYPE_BIT         =  16
local MYSQL_TYPE_TIMESTAMP2  =  17
local MYSQL_TYPE_DATETIME2   =  18
local MYSQL_TYPE_TIME2       =  19
local MYSQL_TYPE_NEWDECIMAL  = 246
local MYSQL_TYPE_ENUM        = 247
local MYSQL_TYPE_SET         = 248
local MYSQL_TYPE_TINY_BLOB   = 249
local MYSQL_TYPE_MEDIUM_BLOB = 250
local MYSQL_TYPE_LONG_BLOB   = 251
local MYSQL_TYPE_BLOB        = 252
local MYSQL_TYPE_VAR_STRING  = 253
local MYSQL_TYPE_STRING      = 254
local MYSQL_TYPE_GEOMETRY    = 255

local mysql_types = {
	[MYSQL_TYPE_DECIMAL    ] = 'number',
	[MYSQL_TYPE_TINY       ] = 'boolean',
	[MYSQL_TYPE_SHORT      ] = 'number',
	[MYSQL_TYPE_LONG       ] = 'number',
	[MYSQL_TYPE_FLOAT      ] = 'number',
	[MYSQL_TYPE_DOUBLE     ] = 'number',
	[MYSQL_TYPE_TIMESTAMP  ] = 'datetime',
	[MYSQL_TYPE_LONGLONG   ] = 'number',
	[MYSQL_TYPE_INT24      ] = 'number',
	[MYSQL_TYPE_DATE       ] = 'datetime', --used before MySQL 5.0 (4 bytes)
	[MYSQL_TYPE_TIME       ] = 'time',
	[MYSQL_TYPE_DATETIME   ] = 'datetime',
	[MYSQL_TYPE_YEAR       ] = 'number',
	[MYSQL_TYPE_NEWDATE    ] = 'datetime', --new from MySQL 5.0 (3 bytes)
	[MYSQL_TYPE_VARCHAR    ] = 'text',
	[MYSQL_TYPE_TIMESTAMP2 ] = 'date',
	[MYSQL_TYPE_DATETIME2  ] = 'datetime',
	[MYSQL_TYPE_TIME2      ] = 'time',
	[MYSQL_TYPE_NEWDECIMAL ] = 'number',
	[MYSQL_TYPE_ENUM       ] = 'enum',
	--[MYSQL_TYPE_SET        ] = '',
	[MYSQL_TYPE_TINY_BLOB  ] = 'file',
	[MYSQL_TYPE_MEDIUM_BLOB] = 'file',
	[MYSQL_TYPE_LONG_BLOB  ] = 'file',
	[MYSQL_TYPE_BLOB       ] = 'file',
	--[MYSQL_TYPE_VAR_STRING ] = '',
	--[MYSQL_TYPE_STRING     ] = '',
	--[MYSQL_TYPE_GEOMETRY   ] = '',
}

local mysql_range = {
	--[MYSQL_TYPE_DECIMAL    ] = {},
	[MYSQL_TYPE_TINY       ] = {-127, 127, 0, 255},
	[MYSQL_TYPE_SHORT      ] = {-32768, 32767, 0, 65535},
	[MYSQL_TYPE_LONG       ] = {},
	--[MYSQL_TYPE_FLOAT      ] = {},
	--[MYSQL_TYPE_DOUBLE     ] = {},
	[MYSQL_TYPE_LONGLONG   ] = {},
	[MYSQL_TYPE_INT24      ] = {-2^23, 2^23-1, 0, 2^24-1},
	--[MYSQL_TYPE_NEWDECIMAL ] = {},
}

local mysql_charsize = {
	[33] = 3, --utf8
	[45] = 4, --utf8mb4
}

local function field_defs_from_query_result_cols(col_info, id_table)
	local t, pk, id_col = {}, {}
	local tbls, field_bycol = {}, {}
	for i,col in ipairs(col_info) do
		local field = {}
		field.name = col.name
		local type = mysql_types[col.type]
		field.type = type
		field.allow_null = col.allow_null
		if col.pri_key then
			field.hidden = false
		end
		if col.auto_increment then
			field.focusable = false
			field.editable = false
			field.hidden = true
			field.is_id = true
			id_col = id_col or col.name
			if col.orig_table == id_table then
				id_col = col.name
			end
		end
		if type == 'number' then
			local range = mysql_range[col.type]
			if range then
				field.min = range[1 + (col.unsigned and 2 or 0)]
				field.max = range[2 + (col.unsigned and 2 or 0)]
			end
			if col.type ~= MYSQL_TYPE_FLOAT and col.type ~= MYSQL_TYPE_DOUBLE then
				field.multiple_of = 1 / 10^col.decimals
			end
		elseif not type then
			field.maxlen = col.length * (mysql_charsize[col.charsetnr] or 1)
		end
		t[i] = field
		if col.pri_key or col.unique_key then
			add(pk, col.name)
		end

		if col.schema and col.orig_table and col.orig_name then
			tbls[tblname(col.schema, col.orig_table)] = true
			field_bycol[colname(col.schema, col.orig_table, col.orig_name)] = field
		end
	end
	tbls = concat(glue.keys(tbls), ' ')
	for col, info in pairs(col_defs(tbls)) do
		local field = field_bycol[col]
		if field then
			update(field, info)
		end
	end
	return t, pk, id_col
end

local function where_sql(tbl, pk, suffix)
	local t = {'where '}
	for i,k in ipairs(pk) do
		append(t, sqlname(tbl), '.', sqlname(k), ' <=> ', ':', k, suffix or '', ' and ')
	end
	t[#t] = nil --remove the last ' and '.
	return concat(t)
end

local function set_sql(fields, values)
	local t = {}
	for _,k in ipairs(fields) do
		local v = values[k]
		if v == nil then
			v = values['param:'..k]
		end
		if v ~= nil then
			add(t, sqlname(k)..' = '..sqlval(v))
		end
	end
	return t
end

local function insert_sql(tbl, fields, values)
	local t = set_sql(fields, values)
	if #t == 0 then --no fields, special syntax.
		return 'insert into ::_tbl values ()', {_tbl = tbl}
	end
	return outdent([[
		insert into ::_tbl set
			{_set}
	]]), update({_tbl = tbl, _set = concat(t, ',\n\t\t\t')}, values)
end

local function update_sql(tbl, fields, where_sql, values)
	local t = set_sql(fields, values)
	if #t == 0 then
		return
	end
	return outdent([[
		update ::_tbl set
			{_set}
		where ]])..where_sql, update({_tbl = tbl, _set = concat(t, ',\n\t\t\t')}, values)
end

local function delete_sql(tbl, where_sql, values)
	return 'delete from ::_tbl where '..where_sql, update({_tbl = tbl}, values)
end

--[[

	db          : optional, connection alias to query on.
	schema      : optional, different current schema to use for query.

	select      : select without where clause.
	where_all   : where clause for all rows (without the word "where").
	where_row   : where clause for single row: 'tbl.pk1 = :pk1_alias:old and ...'

	select + where_all => select_all
	select + where_row => select_row

	pk          : 'pk1_alias ...', for when MySQL can't deduce it from the query.
	id_table    : 'tbl', for trees, when multiple auto_increment fields are selected.

	update_tables : {{table=,...},...}

		table         : 'tbl'
		fields        : 'foo bar'

		fields => insert_fields
		fields => update_fields

		table + insert_fields => insert_sql
		table + update_fields + where_row => update_sql
		table + where_row => delete_sql


]]
function sql_rowset(...)
	return virtual_rowset(function(rs, sql, ...)

		if type(sql) == 'string' then
			rs.select = sql
		else
			update(rs, sql, ...)
		end

		rs.pk = glue.names(rs.pk)

		if not rs.select_all and rs.select then
			rs.select_all = outdent(rs.select)
				.. (rs.where_all and '\nwhere '..rs.where_all or '')
		end

		if not rs.select_row and rs.select and rs.where_row then
			rs.select_row = outdent(rs.select) .. '\nwhere ' .. rs.where_row
		end

		assert(rs.select_all)

		local function query(...)
			return pquery_on(rs.db, rs.query_options or empty, ...)
		end

		local function query1(...)
			return pquery1_on(rs.db, rs.query_options or empty, ...)
		end

		local function use_schema()
			if not rs.schema then return end
			pquery('use '..rs.schema)
		end

		if rs.select_row then
			use_schema()
			function rs:load_row(row_values, param_values)
				return pquery1(rs.select_row, update({}, param_values, row_values))
			end
		end

		function rs:load_rows(res, param_values)
			use_schema()
			pp('load_rows', param_values)
			local rows, cols, params = query(rs.select_all, param_values)

			local fields, pk, id_col =
				field_defs_from_query_result_cols(cols, rs.id_table)

			merge(res, {
				fields = fields,
				pk = pk,
				id_col = id_col,
				rows = rows,
				params = params,
			})
		end

		local apply_changes = rs.apply_changes
		function rs:apply_changes(changes)
			local res = apply_changes(self, changes)
			return res
		end

		rs.update_tables = rs.update_table and {rs.update_table} or rs.update_tables
		if rs.update_tables then

			local mins, mupd, mdel

			for _,t in ipairs(rs.update_tables) do

				t.insert_fields = glue.names(t.insert_fields or t.fields)
				t.update_fields = glue.names(t.update_fields or t.fields)

				if t.insert_sql or (t.table and t.insert_fields) then
					local insert_row = rs.insert_row or glue.noop
					mins = mins or (rs.insert_row and true)
					function rs:insert_row(row)
						local affected_rows, id0 = insert_row(self, row)
						if affected_rows == 0 then
							return 0
						end
						local sql, params
						if t.insert_sql then
							sql, params = t.insert_sql, row
						else
							sql, params = insert_sql(t.table, t.insert_fields, row)
						end
						local r = query(sql, params)
						local id = r.insert_id ~= 0 and r.insert_id or nil
						if id then
							row[t.autoinc] = id
							row[t.autoinc..':old'] = id --for selecting it back
						end
						return r.affected_rows, id or id0
					end
				end

				if t.update_sql or (t.table and t.update_fields and t.where) then
					local update_row = rs.update_row or glue.noop
					mupd = mupd or (rs.update_row and true)
					function rs:update_row(row)
						update_row(self, row)
						local sql, params
						if t.update_sql then
							sql, params = t.update_sql, row
						else
							sql, params = update_sql(t.table, t.update_fields, t.where, row)
						end
						if sql then
							local r = query(sql, params)
							return r.affected_rows
						end
					end
				end

				if t.delete_sql or (t.table and t.where and t.delete ~= false) then
					local delete_row = rs.delete_row or glue.noop
					mdel = mdel or (rs.delete_row and true)
					function rs:delete_row(row)
						local affected_rows = delete_row(self, row)
						if affected_rows == 0 then
							return 0
						end
						local sql, params
						if t.delete_sql then
							sql, params = t.delete_sql, row
						else
							sql, params = delete_sql(t.table, t.where, row)
						end
						local r = query(sql, params)
						return r.affected_rows
					end
				end

			end

			if mins then local insert_row = rs.insert_row; function rs.insert_row(...) return patomic(insert_row, ...) end end
			if mupd then local update_row = rs.update_row; function rs.update_row(...) return patomic(update_row, ...) end end
			if mdel then local delete_row = rs.delete_row; function rs.delete_row(...) return patomic(delete_row, ...) end end

		end

	end, ...)
end
