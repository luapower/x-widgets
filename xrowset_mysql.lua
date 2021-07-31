--[[

	MySQL rowsets.
	Written by Cosmin Apreutesei. Public Domain.

	What must be specified manually:
		- select        : select without where clause.
		- where_all     : where clause for all rows (without the word "where").
		- pk            : 'foo bar ...', required as it can't be inferred reliably.
		- db            : optional, connection alias to query on.
		- schema        : optional, different current schema to use for query.
		- update_tables : 'tbl1 ...', tables to I/U/D into/from, in order.

	More complex cases can specify:
		- select_all    : instead of select + where_all.
		- where_row     : where clause for single row: 'tbl.pk1 = :pk1_alias and ...'.
		- select_row    : instead of select + where_row.
		- select_none   : instead of select_row or (select + 'where 1 = 0').
		- tables        : {tbl->ut}, table definition for I/U/D query generation.
			ut.col_map = 'col1[=col1_alias] ...'
			ut.pk = 'col1 ...'
			ut.ai_col = 'col'

	If all else fails, you can always DIY by implementing any of the
	virtual_rowset's S/U/I/D methods. Just make sure to wrap multiple update
	queries in atomic() and check affected_rows as needed.

	What can be inferred from the select query for non-expression columns:
		- full field list with name, type and type definition:
			- 'text': maxlen.
			- 'bool': constant default.
			- 'number': range, multiple_of, constant default.
			- 'enum': enum_values, constant default.
			- 'datetime': constant default.
			- 'time'.
			- 'file'.
		- field's `not_null` flag.
		- field's `auto_increment` flag which makes the field non-editable.
		- field's origin table and column name in origin table.
			- fields without origin (sql expressions) are made non-editable.
		- `pk` and `ai_col` of origin tables, for generating I/U/D queries.
		- `where_row` is auto-generated if all pk fields map to table columns.

	How to use rowset param values in queries:
		- :filter      : in where_all:
			- `tbl.pk in (:filter)`, if the rowset's pk is a single column.
			- `$filter(foo = :foo and bar = :bar, :filter)` for composite pks.
		- :param:lang  : in select where clause.
		- :COL         : as insert and update values.
		- :COL:old     : in update and delete where clause.

]]

require'xrowset'

local format = string.format
local concat = table.concat
local add = table.insert

local outdent = glue.outdent
local names = glue.names
local noop = glue.noop
local index = glue.index
local keys = glue.keys
local count = glue.count
local merge = glue.merge
local assertf = glue.assert

local function repl(x, v, r)
	if x == v then return r else return x end
end

local function namemap(s)
	if type(s) ~= 'string' then
		return s
	end
	local t = {}
	for _,s in ipairs(names(s)) do
		local tbl_col, sel_col = s:match'^(.-)%=(.*)$'
		if not sel_col then
			tbl_col, sel_col = s, s
		end
		t[tbl_col] = select_col
	end
	return t
end

local col_attrs = {} --{sch_tbl_col->attrs}

local function sch_tbl_col(sch, tbl, col)
	return format('%s\0%s\0%s', sch:lower(), tbl:lower(), col:lower())
end

function colattrs(sch_tbl, ts)
	local sch, tbl = sch_tbl:match'^(.-)%.(.*)$'
	sch = sch or dbname()
	for col, t in pairs(ts) do
		update(attr(col_attrs, sch_tbl_col(sch, tbl, col)), t)
	end
end

local function parse_enum(s)
	local vals = s:match'^enum%((.-)%)$'
	if not vals then return end
	local t = {}
	vals:gsub("'(.-)'", function(s)
		t[#t+1] = s
	end)
	return 'enum', t
end

local table_def = memoize(function(sch, tbl)
	local fields, pk, ai_col = {}, {}
	for i,t in ipairs(kv_query([[
		select
			c.column_name as col,
			c.column_type as col_type,
			c.column_key as pri_key,
			c.column_default,
			c.is_nullable,
			c.extra

			--c.data_type,
			--c.character_maximum_length,
			--c.numeric_precision,
			--c.numeric_scale,
			--c.datetime_precision,
			--c.character_set_name,
			--c.is_generated,

		from
			information_schema.columns c
		where
			c.table_schema = ? and c.table_name = ?
		]], sch, tbl))
	do
		local field_type, enum_values = parse_enum(t.col_type)
		local default = repl(t.column_default, null, nil)
		local has_default = default ~= nil
		if t.col_type == 'tinyint' then --bool
			field_type = 'bool'
			default = repl(default, '1', true)
			default = repl(default, '0', false)
			if has_default and default ~= true and default ~= false then
				default = nil --expression, can't send to client.
			end
		elseif t.col_type == 'timestamp' then
			default = repl(default, 'CURRENT_TIMESTAMP', nil)
			--TODO: parse date/time and remove if not parsing.
		end
		local sch_tbl_col = sch_tbl_col(sch, tbl, t.col)
		local col_attrs = col_attrs[sch_tbl_col]
		if t.extra == 'auto_increment' then
			assert(not ai_col)
			ai_col = t.col
		end
		if t.pri_key == 'PRI' then
			pk[#pk+1] = t.col
		end
		fields[t.col] = update({
			field_type = field_type,
			enum_values = enum_values,
			has_default = has_default or nil,
			default = default,
			auto_increment = t.extra == 'auto_increment' or nil,
			not_null = t.is_nullable == 'NO' or nil, --redundant
		}, col_attrs)
	end
	return {fields = fields, pk = pk, ai_col = ai_col}
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
	[MYSQL_TYPE_TINY       ] = 'bool',
	[MYSQL_TYPE_SHORT      ] = 'number',
	[MYSQL_TYPE_LONG       ] = 'number',
	[MYSQL_TYPE_FLOAT      ] = 'number',
	[MYSQL_TYPE_DOUBLE     ] = 'number',
	[MYSQL_TYPE_TIMESTAMP  ] = 'datetime',
	[MYSQL_TYPE_LONGLONG   ] = 'number',
	[MYSQL_TYPE_INT24      ] = 'number',
	[MYSQL_TYPE_DATE       ] = 'date', --used before MySQL 5.0 (4 bytes)
	[MYSQL_TYPE_TIME       ] = 'time',
	[MYSQL_TYPE_DATETIME   ] = 'datetime',
	[MYSQL_TYPE_YEAR       ] = 'number',
	[MYSQL_TYPE_NEWDATE    ] = 'date', --new from MySQL 5.0 (3 bytes)
	[MYSQL_TYPE_VARCHAR    ] = 'text',
	[MYSQL_TYPE_TIMESTAMP2 ] = 'datetime',
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

local function infer_fields(fields, cur_schema)

	local rs = {}
	rs.fields = {}
	rs.select_tables = {}
	rs.field_map = {} --{sel_col->field}
	rs.where_col_map = {} --{sel_col->sch.tbl_alias.col}

	for i,t in ipairs(fields) do

		local f = {}
		rs.fields[i] = f
		rs.field_map[t.name] = f

		--augment col def with metadata from information_schema.
		local tbl_alias = t.table
		local sch = t.schema
		local tbl = t.orig_table
		local col = t.orig_name
		local tbl_def
		if sch and tbl and col then
			tbl_def = table_def(sch, tbl)
			update(t, tbl_def.fields[col])
		end

		f.name = t.name
		f.type = t.field_type or mysql_types[t.type]
		f.not_null = t.not_null
		f.enum_values = t.enum_values

		if t.auto_increment then
			f.editable = false
		end

		if f.type == 'number' then
			local range = mysql_range[t.type]
			if range then
				f.min = range[1 + (t.unsigned and 2 or 0)]
				f.max = range[2 + (t.unsigned and 2 or 0)]
			end
			if t.type ~= MYSQL_TYPE_FLOAT and t.type ~= MYSQL_TYPE_DOUBLE then
				f.multiple_of = 1 / 10^t.decimals
			end
		elseif not f.type then
			f.maxlen = t.length * (mysql_charsize[t.charsetnr] or 1)
		end

		if tbl_def then
			sch = sch ~= (cur_schema or dbname()) and sch or nil
			local tbl = (sch and sch..'.' or '')..tbl
			local quoted_tbl = (sch and sqlname(sch)..'.' or '')..sqlname(tbl)
			local quoted_tbl_alias = (sch and sqlname(sch)..'.' or '')..sqlname(tbl_alias)
			rs.where_col_map[t.name] = quoted_tbl_alias..'.'..sqlname(col)
			local ut = rs.select_tables[tbl]
			if not ut then
				ut = {table = quoted_tbl, pk = tbl_def.pk, ai_col = tbl_def.ai_col}
				rs.select_tables[tbl] = ut
			end
			attr(ut, 'col_map')[col] = t.name
		else
			f.editable = false
		end
	end

	return rs
end

function sql_rowset(...)
	return virtual_rowset(function(rs, sql, ...)

		if type(sql) == 'string' then
			rs.select = sql
		else
			update(rs, sql, ...)
		end

		rs.delay_init_fields = true

		--the rowset's pk cannot be reliably inferred so it must be user-supplied.
		rs.pk = names(rs.pk)
		assert(rs.pk and #rs.pk > 0, 'pk missing')
		table.sort(rs.pk)

		--static query generation (just stitching together user-supplied parts).

		if not rs.select_all and rs.select then
			rs.select_all = outdent(rs.select)
				.. (rs.where_all and '\nwhere '..rs.where_all or '')
		end

		if not rs.select_row and rs.select and rs.where_row then
			rs.select_row = outdent(rs.select) .. '\nwhere ' .. rs.where_row
		end

		if not rs.select_none and rs.select then
			rs.select_none = rs.select .. '\nwhere 1 = 0'
		end

		--query wrappers.

		local atomic = patomic
		local function use_schema()
			if not rs.schema then return end
			pquery_on(rs.db, 'use '..sqlname(rs.schema))
		end
		local query_options = {
			auto_array_result = false,
			convert_result = rs.convert_result,
		}
		local function query(...)
			use_schema()
			return pquery_on(rs.connection, query_options, ...)
		end

		--see if we can make a static load_row().

		local convert_row

		if not rs.load_row and rs.select_row then
			function rs:load_row(vals)
				local rows = query(rs.select_row, vals)
				if convert_row and #rows == 1 then
					convert_row(rows[1])
				end
				return rows
			end
		end

		--dynamic query generation based on RTTI obtained from first-time
		--running the select query.

		local function where_row_sql(vals)
			local t = {}
			for _,sel_col in ipairs(rs.pk) do
				local where_col = rs.where_col_map[sel_col]
				local v = vals[sel_col]
				append(t, where_col, ' = ', sqlval(v), ' and ')
			end
			t[#t] = nil --remove the last ' and '.
			return concat(t)
		end

		local function set_sql(ut, vals)
			local t = {}
			for tbl_col, sel_col in glue.sortedpairs(ut.col_map) do
				if rs.field_map[sel_col].editable ~= false then
					local v = vals[sel_col]
					if v ~= nil then
						add(t, sqlname(tbl_col)..' = '..sqlval(v))
					end
				end
			end
			return #t > 0 and concat(t, ',\n\t')
		end

		local function where_sql(ut, vals)
			if ut.where then
				return ut.where
			end
			ut.pk = names(ut.pk)
			local t = {}
			for _,tbl_col in ipairs(ut.pk) do
				local sel_col = ut.col_map[tbl_col]
				local v = vals[sel_col..':old']
				append(t, sqlname(tbl_col), ' = ', sqlval(v), ' and ')
			end
			t[#t] = nil --remove the last ' and '.
			return concat(t)
		end

		--usage: ut_tbl(tbl[, ut]) or ut_tbl(ut)
		local function ut_tbl(tbl, ut)
			local ut
			if type(tbl) == 'table' then
				ut = tbl
				tbl = ut.table
			else
				ut = update({},
					rs.select_tables[tbl],
					rs.tables and rs.tables[tbl],
					ut)
			end
			ut.col_map = namemap(ut.col_map)
			assertf(ut.col_map, 'col_map missing for %s', tbl)
			local quoted_tbl = ut.table or sqlname(tbl)
			return ut, quoted_tbl
		end

		function rs:insert_in(tbl, vals, ut)
			local ut, tbl = ut_tbl(tbl, ut)
			local set_sql = set_sql(ut, vals)
			local r
			if not set_sql then --no fields, special syntax.
				r = query('insert into ::_tbl values ()', {_tbl = tbl})
			else
				r = query(outdent([[
					insert into ::_tbl set
						{_set}
				]]), update({
					_tbl = tbl,
					_set = set_sql,
				}, vals))
			end
			local id = repl(r.insert_id, 0, nil)
			local id_sel_col = ut.col_map[ut.ai_col]
			if id_sel_col then
				vals[id_sel_col] = id
			end
			return r.affected_rows, id
		end

		function rs:update_in(tbl, vals)
			local ut, tbl = ut_tbl(tbl)
			local set_sql = set_sql(ut, vals)
			if not set_sql then
				return
			end
			local r = query(outdent([[
				update ::_tbl set
					{_set}
				where
					{_where}
			]]), update({
				_tbl = tbl,
				_set = set_sql,
				_where = where_sql(ut, vals),
			}, vals))
			return r.affected_rows
		end

		function rs:delete_in(tbl, vals)
			local ut, tbl = ut_tbl(tbl)
			local r = query(outdent([[
				delete from ::_tbl where {_where}
			]]), update({
				_tbl = tbl,
				_where = where_sql(ut, vals),
			}, vals))
			return r.affected_rows
		end

		--create SIUD-row methods that reconfigure the rowset for updating
		--on the first run of the select query. If IUD_row() is called before
		--load_rows(), it runs the select_none query to get the RTTI.

		local configure

		if not rs.load_rows then
			assert(rs.select_all, 'select_all missing')
			function rs:load_rows(res, param_values)
				local rows, fields, params = query(rs.select_all, param_values)
				if configure then
					configure(fields)
					rs.params = params
				end
				if convert_row then
					for i,row in ipairs(rows) do
						convert_row(row)
					end
				end
				res.rows = rows
			end
		end

		local update_tables = names(rs.update_tables)
		local nodelete = index(names(rs.nodelete) or {})

		local user_methods = {}
		if update_tables then
			assert(rs.select_none, 'select_none missing')
			local apply_changes = rs.apply_changes
			function rs:apply_changes(changes)
				if configure then
					local _, fields = query(rs.select_none)
					configure(fields)
				end
				return apply_changes(self, changes)
			end
			--make virtual_rowset believe this rowset is updatable.
			rs.insert_row = noop
			rs.update_row = noop
			rs.delete_row = noop
		end

		--[[local]] function configure(fields)

			configure = nil --one-shot.

			merge(rs, infer_fields(fields, rs.schema))

			rs:init_fields()

			--build a convert_row() function that calls on each field's converter.
			for fi,field in ipairs(rs.fields) do
				local convert_val = field.from_server
				if convert_val then
					local last_convert_row = convert_row or noop
					convert_row = function(row)
						last_convert_row(row)
						row[fi] = convert_val(row[fi])
					end
				end
			end

			if not update_tables then
				return
			end

			if not rs.load_row then
				assert(rs.select, 'select missing to create load_row()')
				function rs:load_row(vals)
					local select_sql = outdent(rs.select)
					local where_sql = where_row_sql(vals)
					local sql = rs.where_all
						and format('%s\nwhere (%s) and (%s)', select_sql, rs.where_all, where_sql)
						 or format('%s\nwhere %s', select_sql, where_sql)
					local rows = query(sql)
					if convert_row and #rows > 0 then
						convert_row(rows[1])
					end
					return rows
				end
			end

			--generate I/U/D methods.

			rs.insert_row = repl(rs.insert_row, noop, nil)
			rs.update_row = repl(rs.update_row, noop, nil)
			rs.delete_row = repl(rs.delete_row, noop, nil)
			local has_insert_row = rs.insert_row
			local has_update_row = rs.update_row
			local has_delete_row = rs.delete_row

			--chain update methods and wrap multiple queries in transactions.
			local mins, mupd, mdel --multiple* flags
			for _,tbl in ipairs(update_tables) do
				local ut = ut_tbl(tbl)
				local insert_in = rs.insert_in
				local update_in = rs.update_in
				local delete_in = not nodelete[tbl] and ut.delete ~= false and rs.delete_in
				if not has_insert_row and insert_in then
					local last_insert_row = rs.insert_row
					mins = mins or (rs.insert_row and true)
					function rs:insert_row(row)
						if last_insert_row then
							local affected_rows, id0 = last_insert_row(self, row)
							if affected_rows == 0 then --stop here.
								return 0
							end
						end
						local affected_rows, id = insert_in(self, ut, row)
						return affected_rows, id or id0
					end
				end
				if not has_update_row and update_in then
					local last_update_row = rs.update_row
					mupd = mupd or (rs.update_row and true)
					function rs:update_row(row)
						if last_update_row then
							last_update_row(self, row)
						end
						return update_in(self, ut, row)
					end
				end
				if not has_delete_row and delete_in then
					local last_delete_row = rs.delete_row
					mdel = mdel or (rs.delete_row and true)
					function rs:delete_row(row)
						if last_delete_row then
							local affected_rows = last_delete_row(self, row)
							if affected_rows == 0 then --stop here.
								return 0
							end
						end
						return delete_in(self, ut, row)
					end
				end
			end
			if mins then local insert_row = rs.insert_row; function rs.insert_row(...) return atomic(insert_row, ...) end end
			if mupd then local update_row = rs.update_row; function rs.update_row(...) return atomic(update_row, ...) end end
			if mdel then local delete_row = rs.delete_row; function rs.delete_row(...) return atomic(delete_row, ...) end end
		end

	end, ...)
end

field_type_attrs.bool = {
	from_server = function(v)
		if v == nil then return nil end
		return v == 1
	end,
}
