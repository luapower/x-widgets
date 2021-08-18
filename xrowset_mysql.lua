--[[

	MySQL rowsets.
	Written by Cosmin Apreutesei. Public Domain.

	What must be specified manually:
		- select        : select without where clause.
		- where_all     : where clause for all rows (without the word "where").
		- pk            : 'foo bar ...', required as it can't be inferred reliably.
		- db            : optional, connection alias to query on.
		- schema        : optional, different current schema to use for query.
		- update_tables : '[sch.]tbl1 ...', tables to I/U/D into/from, in order.

	More complex cases can specify:
		- select_all    : instead of select + where_all.
		- where_row     : where clause for single row: 'tbl.pk1 = :as_pk1 and ...'.
		- select_row    : instead of select + where_row.
		- select_none   : instead of select_row or (select + 'where 1 = 0').
		- table_attrs   : {tbl->ut}, table definition for I/U/D query generation.
		  - ut.col_map  : {col->as_col}
		  - ut.pk       : 'col1 ...'
		  - ut.ai_col   : 'col'

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
		- :param:filter: in where_all:
			- `tbl.pk in (:param:filter)`, if the rowset's pk is a single column.
			- `$filter(foo = :foo and bar = :bar, :param:filter)` for composite pks.
		- :param:lang  : in select where clause.
		- :COL         : as insert and update values.
		- :COL:old     : in update and delete where clause.

]]

require'xrowset'
require'webb_query'

local glue = require'glue'

local format = string.format
local concat = table.concat
local add = table.insert

local outdent = glue.outdent
local names = glue.names
local noop = glue.noop
local index = glue.index
local assertf = glue.assert
local repl = glue.repl
local memoize = glue.memoize
local sortedpairs = glue.sortedpairs

--usage in sql:
	-- single-key: foo in (:param:filter)
	-- multi-key : $filter(foo <=> :foo and bar <=> :bar, :param:filter)
function qmacro.filter(expr, filter)
	local t = {}
	for i,vals in ipairs(filter) do
		t[i] = sqlparams(expr, vals)
	end
	return concat(t, ' or ')
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

local mysql_type = {
	tinyint     = 'bool',
	shortint    = 'number',
	mediumint   = 'number',
	int         = 'number',
	bigint      = 'number',
	float       = 'number',
	double      = 'number',
	decimal     = 'number',
	year        = 'number',
	enum        = 'enum',
	timestamp   = 'datetime',
	datetime    = 'datetime',
	date        = 'date',
	time        = 'time',
	varchar     = 'text',
	char        = 'text',
	tinytext    = 'text',
	mediumtext  = 'text',
	longtext    = 'text',
	blob        = 'file',
	tinyblob    = 'file',
	mediumblob  = 'file',
	longblob    = 'file',
}

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

		local function query(...)
			local db = db(rs.db)
			if rs.schema then
				db:query('use '..sqlname(rs.schema))
			end
			return db:query(...)
		end

		--see if we can make a static load_row().

		if not rs.load_row and rs.select_row then
			function rs:load_row(vals)
				return query(rs.select_row, vals)
			end
		end

		--dynamic query generation based on RTTI obtained from running
		--the select query the first time.

		local function where_row_sql()
			local t = {}
			for i, as_col in ipairs(rs.pk) do
				local where_col = rs.where_col_map[as_col]
				if i > 1 then add(t, ' and ') end
				add(t, where_col..' = :'..as_col)
			end
			return concat(t)
		end

		--create SIUD-row methods that reconfigure the rowset for updating
		--on the first run of the select query. If IUD_row() is called before
		--load_rows(), it runs the select_none query to get the RTTI.

		local configure

		local load_opt = {
			compact = 1,
			null_value = null,
		}

		if not rs.load_rows then
			assert(rs.select_all, 'select_all missing')
			function rs:load_rows(res, param_vals)
				local rows, fields, params = query(load_opt, rs.select_all, param_vals)
				if configure then
					configure(fields)
					rs.params = params
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

			rs.fields = {} --{field1,...}
			rs.field_map = {} --{as_col->field}
			rs.where_col_map = {} --{as_col->`sch`.`as_tbl`.`col`}

			local get_ut = memoize(function(sch, tbl)
				local tbl_def = table_def(sch, tbl)
				local sch_tbl = sch_tbl(sch, tbl)
				return update({
						table = sqltablename(sch, tbl),
						pk = tbl_def.pk,
						ai_col = tbl_def.ai_col,
					}, rs.table_attrs and rs.table_attrs[sch_tbl])
			end)
			function rs:ut(sch_tbl)
				if type(sch_tbl) == 'table' then --ut: pass-through
					return sch_tbl
				end
				return get_ut(sch_tbl_arg(sch_tbl))
			end

			local function map_col(sch, tbl, col, as_col)
				local ut = self:ut(sch, tbl)
				attr(ut, 'col_map')[col] = as_col
			end

			for fi,t in ipairs(fields) do

				local as_col = t.name
				local f = {}
				rs.fields[fi] = f
				rs.field_map[as_col] = f

				--augment the field def with metadata from information_schema.
				--create a column mapping too while we're at it.
				local fa = rs.field_attrs and rs.field_attrs[as_col]
				local as_tbl = t.table or (fa and (fa.as_table or fa.table))
				local sch = t.schema or cur_schema
				local tbl = t.origin_table or (fa and fa.table)
				local col = t.origin_name or (fa and fa.table_col) or as_col
				if sch and as_tbl and col then
					rs.where_col_map[as_col] = sqlcolname(sch, as_tbl, col)
				end
				if sch and tbl and col then
					local tbl_def = table_def(sch, tbl)
					update(t, tbl_def.fields[col])
					map_col(sch, tbl, col, as_col)
				else
					f.editable = false
				end

				f.name = as_col
				f.type = t.field_type or mysql_type[t.type]
				f.not_null = t.not_null
				f.enum_values = t.enum_values
				f.default = t.default

				if t.auto_increment then
					f.editable = false
				end

			end

			--create implicit column mappings.
			if update_tables then
				for _,sch_tbl in ipairs(update_tables) do
					local sch, tbl = sch_tbl_arg(sch_tbl)
					local tbl_def = table_def(sch, tbl)
					for col, t in pairs(tbl_def.fields) do
						local as_col = col
						map_col(sch, tbl, tbl_col, as_col)
					end
				end
			end

			rs:init_fields()

			if not update_tables then
				return
			end

			if not rs.load_row then
				assert(rs.select, 'select missing to create load_row()')
				local where_row = where_row_sql()
				function rs:load_row(vals)
					local sql = outdent(rs.select) .. (where_all
						and format('\nwhere ({%s}) and ({%s})', where_all, where_row)
						 or format('\nwhere {%s}', where_row))
					return query(load_opt, sql, vals)
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
			for _,sch_tbl in ipairs(update_tables) do
				local ut = self:ut(sch_tbl)
				local insert_in = rs.insert_in
				local update_in = rs.update_in
				local delete_in = not nodelete[sch_tbl] and ut.delete ~= false and rs.delete_in
				if not has_insert_row and insert_in then
					local last_insert_row = rs.insert_row
					mins = mins or (rs.insert_row and true)
					function rs:insert_row(row, server_vals)
						if last_insert_row then
							local affected_rows = last_insert_row(self, row, server_vals)
							if affected_rows == 0 then --stop here.
								return 0
							end
						end
						return insert_in(self, ut, row, server_vals)
					end
				end
				if not has_update_row and update_in then
					local last_update_row = rs.update_row
					mupd = mupd or (rs.update_row and true)
					function rs:update_row(row, server_vals)
						if last_update_row then
							last_update_row(self, row, server_vals)
						end
						update_in(self, ut, row, server_vals)
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
	from_server = function(self, v)
		if v == nil then return nil end
		return v ~= 0
	end,
}
