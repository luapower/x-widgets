/*

	Polygon-based editable 3D models.
	Written by Cosmin Apreutesei. Public Domain.

*/

(function() {

// Models are comprised primarily of polygons enclosed and connected by lines
// defined over a common point cloud. A model can contain instances of other
// models at their own transform matrix, and can also contain standalone lines.

// The editing API implements the direct manipulation UI and is designed to
// perform automatic creation/removal/intersection of points/lines/polygons
// while keeping the model numerically stable and clean. In particular:
// - editing operations never leave duplicate points/lines/polygons.
// - existing points are never moved when adding new geometry.
// - when existing lines are cut, straightness is preserved to best accuracy.

function real_p2p_distance2(p1, p2) { // stub
	return p1.distance2(p2)
}

function set_xyz(a, pi, x, y, z) {
	a[3*pi+0] = x
	a[3*pi+1] = y
	a[3*pi+2] = z
}

model3 = function(e) {

	e = e || {}
	let gl = e.gl

	let instances_valid

	// layers -----------------------------------------------------------------

	let layers = []
	let next_layer_num = 0

	function add_layer(opt) {
		layer = assign({name: 'layer '+(next_layer_num++), visible: true, can_hide: true}, opt)
		layers.push(layer)
		instances_valid = false
		return layer
	}

	function remove_layer(layer) {
		// TODO: move tbis layer's instances to the default layer.
		layers.remove_value(layer)
		instances_valid = false
	}

	function layer_set_visibile(layer, visible) {
		layer.visible = !!visible
		instances_valid = false
	}

	// components -------------------------------------------------------------

	let comps         = [] // [comp1,...]
	let free_comp_ids = [] // [ci1,...]
	let comp_by_id = map() // {ci -> comp}

	function add_component(comp) {
		let id = free_comp_ids.pop()
		if (id == null)
			id = comps.length
		comps[id] = comp
		comp.id = id
		comp_by_id.set(id, comp)
	}

	function remove_component(comp) {
		comps[comp.id] = null
		free_comp_ids.push(comp.id)
	}

	e.add_component = add_component

	// component instances ----------------------------------------------------

	// NOTE: instance objects are mat4's, that's ok, don't sweat it.

	let root_inst

	function each_child_inst(children, f) {
		if (children)
			for (let child_inst of children)
				each_child_inst(child_inst, inst)
	}

	function each_instance(f) {
		each_child_inst(root_inst.comp.children, f)
	}

	function child_added(parent_comp, inst) {
		instances_valid = false
	}

	function child_removed(parent_comp, inst) {
		instances_valid = false
	}

	function child_changed(inst) {
		//
		instances_valid = false
	}

	let _m = mat4()

	function update_instance_matrix(inst, parent_inst) {
		let dab = inst.comp.model_dab
		let i = dab.len
		dab.len = i + 1
		_m.set(inst).mul(parent_inst).to_mat4_array(dab.array, i)

		let children = inst.comp.children
		if (children)
			for (let child_inst of children)
				if (child_inst.layer.visible)
					update_instance_matrix(child_inst, inst)
	}

	function update_instance_matrices() {

		if (instances_valid)
			return

		for (let comp of comps)
			if (comp.model_dab)
				comp.model_dab.len = 0
			else
				comp.model_dab = gl.dyn_arr_mat4_instance_buffer()

		update_instance_matrix(root_inst, mat4.identity)

		for (let comp of comps)
			comp.model_dab.upload()

		instances_valid = true
	}

	function init_root() {
		e.root = e.root || model3_component({model: e})
		root_inst = mat4()
		root_inst.comp = e.root
		e.default_layer = add_layer({name: 'default', can_hide: false})
	}

	function gc_components() {
		for (let [comp, insts] of instances) {
			if (!insts.length) {
				if (insts.dab)
					insts.dab.free()
				instances.delete(comp)
				remove_component(comp)
				comp.free()
			}
		}
	}

	e.child_added = child_added
	e.child_removed = child_removed
	e.child_changed = child_changed
	e.gc_components = gc_components

	// rendering --------------------------------------------------------------

	function draw(prog) {
		update_instance_matrices()
		for (let comp of comps)
			comp.draw(prog, comp.model_dab.buffer)
	}

	e.draw = draw

	// hit-testing ------------------------------------------------------------

	let face_id_rr = gl.face_id_renderer()

	function update_mouse() {
		face_id_rr.render(draw)
	}

	{
	let hit = {}
	let inst = mat4()
	function hit_test(mx, my, out) {
		let inst_model, inst_point, face
		if (face_id_rr.hit_test(mx, my, hit)) {
			let comp_id = hit.face_id >>> 18 // 32K components
			let fi      = hit.face_id & ((1 << 18) - 1) // 500K faces each
			let comp = comp_by_id.get(comp_id)
			inst.from_mat4_array(comp.model_dab.array, hit.inst_id)
			out.comp = comp
			out.inst = inst
			out.face = comp.face_at(fi)
			return out
		}
	}}

	e.update_mouse = update_mouse
	e.hit_test     = hit_test

	// materials --------------------------------------------------------------

	let materials = [] //[{diffuse_color:, diffuse_map:, uv: , opacity: , faces: [face1,...]},...]

	function add_material(opt) {
		let mat = assign({
			diffuse_color: 0xffffff,
			uv: v2(1, 1),
			opacity: 1,
		}, opt)
		mat.opacity = clamp(mat.opacity, 0, 1)
		materials.push(mat)
		return mat
	}

	e.add_material = add_material

	e.default_material = add_material({diffuse_color: 0xffffff})

	// undo/redo stacks -------------------------------------------------------

	let undo_groups = [] // [i1, ...] indices in undo_stack where groups start
	let undo_stack  = [] // [args1...,argc1,f1, ...]
	let redo_groups = [] // same
	let redo_stack  = [] // same

	function start_undo() {
		undo_groups.push(undo_stack.length)
	}

	function push_undo(f, ...args) {
		undo_stack.push(...args, args.length, f)
	}

	function undo_from(stack, start) {
		start_undo()
		while (stack.length >= start) {
			let f = stack.pop()
			let argc = stack.pop()
			f(...stack.splice(-argc))
		}
	}

	function undo() {
		let stack  = undo_stack
		let groups = undo_groups
		let start  = groups.pop()
		if (start == null)
			return
		undo_groups = redo_groups
		undo_stack  = redo_stack
		undo_from(stack, start)
		undo_groups = groups
		undo_stack  = stack
	}

	function redo() {
		undo_from(redo_stack, redo_groups.pop())
	}

	e.start_undo = start_undo
	e.undo = undo
	e.redo = redo
	e.push_undo = push_undo

	// init -------------------------------------------------------------------

	init_root()

	return e

}

model3_component = function(e) {

	let model = assert(e.model)
	let gl = e.model.gl
	let push_undo = model.push_undo

	model.add_component(e)

	function log(s, ...args) {
		assert(DEBUG)
		print(e.id, s, ...args)
	}

	// model (as in MVC and as in 3D model) -----------------------------------

	let points    = [] // [(x, y, z), ...]
	let normals   = [] // [(x, y, z), ...]; normals for smooth meshes.
	let free_pis  = [] // [p1i,...]; freelist of point indices.
	let prc       = [] // [rc1,...]; ref counts of points.
	let lines     = [] // [(p1i, p2i, rc, sm, op), ...]; rc=refcount, sm=smoothness, op=opacity.
	let free_lis  = [] // [l1i,...]; freelist of line indices.
	let faces     = [] // [poly3[p1i, p2i, ..., lis: [line1i,...], selected:, material:, ],...]
	let free_fis  = [] // [face1_index,...]
	let meshes    = set() // {{face},...}; meshes are sets of all faces connected by smooth lines.

	let children  = [] // [mat1,...]

	// model-to-view info (as in MVC).
	let points_changed          // time to reload points_buf.
	let used_points_changed     // time to reload the used_pis_buf.
	let used_lines_changed      // time to reload *_edge_lis_buf.
	let edge_line_count = 0     // number of face edge lines.
	let nonedge_line_count = 0  // number of standalone lines.

	// low-level model editing API that:
	// - records undo ops in the undo stack.
	// - updates and/or invalidates any affected view buffers.

	let point_count = () => prc.length

	{
	let _v0 = v3()
	function get_point(pi, out) {
		out = out || _v0
		out[0] = points[3*pi+0]
		out[1] = points[3*pi+1]
		out[2] = points[3*pi+2]
		out.i = pi
		return out
	}}

	function add_point(x, y, z, need_pi) {

		let pi = free_pis.pop()
		if (pi == null) {
			points.push(x, y, z)
			normals.push(0, 0, 0)
			pi = prc.length
		} else {
			set_xyz(points, pi, x, y, z)
		}
		prc[pi] = 0

		if (need_pi != null)
			assert(pi == need_pi)

		upload_point(pi, x, y, z)

		if (DEBUG)
			log('add_point', pi, x+','+y+','+z)

		return pi
	}

	let unref_point = function(pi) {

		let rc0 = prc[pi]--
		assert(rc0 > 0)

		if (rc0 == 1) {

			free_pis.push(pi)
			used_points_changed = true

			let p = get_point(pi)
			push_undo(add_point, p.x, p.y, p.z, pi)

		}

		push_undo(ref_point, pi)

		// if (DEBUG) log('unref_point', pi, prc[pi])
	}

	let ref_point = function(pi) {

		let rc0 = prc[pi]++

		if (rc0 == 0)
			used_points_changed = true

		push_undo(unref_point, pi)

		// if (DEBUG) log('ref_point', pi, prc[pi])
	}

	function move_point(pi, x, y, z) {
		let p = get_point(pi)
		set_xyz(points, pi, x, y, z)
		upload_point(pi, x, y, z)
		push_undo(move_point, pi, x0, y0, z0)
	}

	let line_count = () => lines.length / 5

	{
	let line = line3()
	function get_line(li, out) {
		out = out || line
		let p1i = lines[5*li+0]
		let p2i = lines[5*li+1]
		get_point(p1i, out[0])
		get_point(p2i, out[1])
		out.i = li
		return out
	}}

	function each_line(f) {
		for (let li = 0, n = line_count(); li < n; li++)
			if (lines[5*li+2]) // ref count: used.
				f(get_line(li))
	}

	function add_line(p1i, p2i, need_li) {

		let li = free_lis.pop()
		if (li == null) {
			li = lines.push(p1i, p2i, 1, 0, 1)
			li = (lines.length / 5) - 1
		} else {
			lines[5*li+0] = p1i
			lines[5*li+1] = p2i
			lines[5*li+2] = 1 // ref. count
			lines[5*li+3] = 0 // smoothness
			lines[5*li+4] = 1 // opacity
		}
		nonedge_line_count++
		used_lines_changed = true

		if (need_li != null)
			assert(li == need_li)

		ref_point(p1i)
		ref_point(p2i)

		push_undo(unref_line, li)

		if (DEBUG)
			log('add_line', li, p1i+','+p2i)

		return li
	}

	function unref_line(li) {

		let rc = --lines[5*li+2]
		assert(rc >= 0)

		if (rc == 0) {

			nonedge_line_count--
			used_lines_changed = true

			let p1i = lines[5*li+0]
			let p2i = lines[5*li+1]

			unref_point(p1i)
			unref_point(p2i)

			free_lis.push(li)

			push_undo(add_line, p1i, p2i, li)

			if (DEBUG)
				log('remove_line', li)

		} else {

			if (rc == 1) {
				nonedge_line_count++
				edge_line_count--
				used_lines_changed = true
			} else {
				edge_line_count--
			}

			push_undo(ref_line, li)

		}

		// if (DEBUG)
			// log('unref_line', li, lines[5*li+2])
	}

	function ref_line(li) {

		let rc0 = lines[5*li+2]++

		if (rc0 == 1) {
			nonedge_line_count--
			edge_line_count++
			used_lines_changed = true
		} else {
			assert(rc0 > 1)
			edge_line_count++
		}

		push_undo(unref_line, li)

		// if (DEBUG)
			// log('ref_line', li, lines[5*li+2])
	}

	let face = {is_face3: true}

	face.get_point = function(ei, out) {
		return get_point(this[ei], out)
	}

	face.get_normal = function(ei, out) {
		if (this.mesh)
			return out.from_v3_array(normals, this[ei])
		else
			return this.plane().normal
	}

	face.get_edge = function(ei, out) {
		out = get_line(this.lis[ei], out)
		out.ei = ei // edge index.
		if (out[1].i == this[ei]) { // fix edge endpoints order.
			let p1 = out[0]
			let p2 = out[1]
			out[0] = p2
			out[1] = p1
		}
		return out
	}

	face.each_edge = function(f) {
		for (let ei = 0, n = this.length; ei < n; ei++)
			f(face.get_edge(ei))
	}

	face.is_flat = function() {
		for (let li of face.lis)
			if (lines[5*li+3])
				return false
		return true
	}

	let face3 = poly3.subclass(face)

	let mat_faces_map = map() // {material -> [face1,...]}

	function material_instance(mat) {
		mat = mat || model.default_material
		let mat_insts = attr(mat_faces_map, mat, Array)
		mat_insts.material = mat
		return mat_insts
	}

	function add_face(pis, lis, material) {
		let face
		let fi = free_fis.pop()
		if (fi == null) {
			fi = faces.length
			face = face3()
			face.lis = []
			face.points = points
			face.index = fi
			face.id = (e.id << 18) | fi
			faces[fi] = face
		} else {
			face = faces[fi]
		}
		if (pis) {
			face.extend(pis)
			for (let pi of pis)
				ref_point(pi)
		}
		if (lis) {
			face.lis.extend(lis)
			for (let li of lis)
				ref_line(li)
		} else
			update_face_lis(face)
		face.mat_inst = material_instance(material)
		face.mat_inst.push(face)
		if (DEBUG)
			log('add_face', face.id, face.join(','), face.lis.join(','), material.id)
		return face
	}

	function remove_face(face) {
		free_fis.push(face.index)
		for (let li of face.lis)
			unref_line(li)
		for (let pi of face)
			unref_point(pi)
		face.length = 0
		face.lis.length = 0
		face.mat_inst.remove_value(face)
		face.mat_inst = null
		if (DEBUG)
			log('remove_face', face.index)
	}

	function face_at(fi) {
		return faces[fi]
	}

	function set_material(face, material) {
		face.mat_inst.remove_value(face)
		face.mat_inst = material_instance(material)
		face.mat_inst.push(face)
		if (DEBUG)
			log('set_material', face.index, material.id)
	}

	function ref_or_add_line(p1i, p2i) {
		let found_li
		for (let li = 0, n = line_count(); li < n; li++) {
			let _p1i = lines[5*li+0]
			let _p2i = lines[5*li+1]
			if ((_p1i == p1i && _p2i == p2i) || (_p1i == p2i && _p2i == p1i)) {
				found_li = li
				break
			}
		}
		let li = found_li != null ? found_li : add_line(p1i, p2i)
		ref_line(li)
		return li
	}

	function update_face_lis(face) {
		let lis = face.lis
		lis.length = 0
		let p1i = face[0]
		for (let i = 1, n = face.length; i < n; i++) {
			let p2i = face[i]
			lis.push(assert(ref_or_add_line(p1i, p2i)))
			p1i = p2i
		}
		lis.push(assert(ref_or_add_line(p1i, face[0])))
	}

	function insert_edge(face, ei, pi, line_before_point, li) {
		let line_ei = ei - (line_before_point ? 1 : 0)
		assert(line_ei >= 0) // can't use ei=0 and line_before_point=true with this function.
		if (DEBUG)
			log('insert_edge', face.index, '@'+ei, 'pi='+pi, '@'+line_ei, 'li='+li, 'before_pi='+face[ei])
		face.insert(ei, pi)
		face.lis.insert(line_ei, li)
		if (face.mesh)
			face.mesh.normals_valid = false
		face.invalidate()
	}

	function each_line_face(li, f) {
		for (let face of faces)
			if (face.lis.includes(li))
				f(face)
	}

	{
	let common_meshes = set()
	let nomesh_faces = []
	function set_line_smoothness(li, sm) {

		let sm0 = lines[5*li+3]
		if (sm == sm0)
			return

		push_undo(set_line_smoothness, li, sm0)

		if (!sm0 == !sm) // smoothness category hasn't changed.
			return

		lines[5*li+3] = sm

		if (sm > 0) { // line has gotten smooth.

			each_line_face(li, function(face) {
				if (face.mesh)
					common_meshes.add(face.mesh)
				else
					nomesh_faces.push(face)
			})

			let target_mesh

			if (common_meshes.size == 0) {
				// none of the faces are part of a mesh, so make one.
				let mesh = set()
				meshes.add(mesh)
				common_meshes.add(mesh)
				target_mesh = mesh
			} else {
				// merge all meshes into the first one and remove the rest.
				for (let mesh of common_meshes) {
					if (!target_mesh) {
						target_mesh = mesh
					} else {
						for (let face of mesh) {
							target_mesh.add(face)
							face.mesh = target_mesh
						}
						meshes.delete(mesh)
					}
				}
			}

			// add flat faces to the target mesh.
			for (let face of nomesh_faces) {
				target_mesh.add(face)
				face.mesh = target_mesh
			}

			target_mesh.normals_valid = false

		} else { // line has gotten non-smooth.

			// remove faces containing `li` from their smooth mesh.
			let target_mesh
			each_line_face(li, function(face) {
				assert(!target_mesh || target_mesh == mesh) // one mesh only.
				target_mesh = face.mesh
				if (face.is_flat())
					face.mesh.delete(face)
				face.mesh = null
			})

			// remove the mesh if it became empty.
			if (target_mesh.size == 0)
				meshes.delete(target_mesh)

		}

		common_meshes.clear()
		nomesh_faces.length = 0
	}}

	function set_line_opacity(li, op) {

		let op0 = lines[5*li+4]
		if (op == op0)
			return

		push_undo(set_line_opacity, li, op0)

		if (!op0 == !op) // opacity category hasn't changed.
			return

		lines[5*li+4] = op
		used_lines_changed = true

	}

	// component children

	function add_child(comp, mat, layer) {
		assert(mat.is_mat4)
		assert(comp.model == model)
		mat.comp = comp
		mat.layer = layer || model.default_layer
		children.push(mat)
		model.child_added(e, mat)
		if (DEBUG)
			log('add_child', mat)
		return mat
	}

	function remove_child(mat) {
		assert(children.remove_value(mat) != -1)
		model.child_removed(e, mat)
	}

	function set_child_layer(mat, layer) {
		assert(mat.comp == this)
		mat.layer = layer
		model.layer_changed(mat)
		return mat
	}

	function set_child_matrix(nat, mat1) {
		assert(mat.comp == this)
		return mat.set(mat1)
	}

	// public API

	e.point_count = point_count
	e.get_point   = get_point

	e.line_count      = line_count
	e.get_line        = get_line
	e.each_line       = each_line
	e.add_line        = add_line
	e.unref_line      = unref_line
	e.set_line_smoothness = set_line_smoothness
	e.set_line_opacity = set_line_opacity

	e.add_face    = add_face
	e.remove_face = remove_face
	e.face_at     = face_at

	e.set_material = set_material

	e.each_line_face = each_line_face

	e.children        = children
	e.add_child       = add_child
	e.remove_child    = remove_child
	e.set_child_layer = set_child_layer

	e.set = function(t) {

		if (t.points)
			for (let i = 0, n = t.points.length; i < n; i += 3)
				add_point(
					t.points[i+0],
					t.points[i+1],
					t.points[i+2]
				)

		if (t.faces)
			for (let ft of t.faces)
				add_face(ft, ft.lis, ft.material)

		if (t.lines)
			for (let i = 0, n = t.lines.length; i < n; i += 2)
				add_line(t.lines[i], t.lines[i+1])

	}

	// face plane -------------------------------------------------------------

	face3.class.center = function(c) {
		c = c || v3()
		let p = v3()
		for (let ei of this) {
			this.get_point(ei, p)
			c.add(p)
		}
		let en = this.length
		c.x = c.x / en
		c.y = c.y / en
		c.z = c.z / en
		return c
	}

	// hit testing & snapping -------------------------------------------------

	function line_intersect_face_plane(line, face) {
		let plane = face.plane()
		let d1 = plane.distance_to_point(line[0])
		let d2 = plane.distance_to_point(line[1])
		if ((d1 < -NEARD && d2 > NEARD) || (d2 < -NEARD && d1 > NEARD)) {
			let int_p = plane.intersect_line(line, v3())
			if (int_p) {
				int_p.face = face
				int_p.snap = 'line_plane_intersection'
				return int_p
			}
		}
	}

	// return the line from target line to its closest point
	// with the point index in line[1].i.
	function line_hit_points(target_line, max_d, p2p_distance2, f) {
		let min_ds = 1/0
		let int_line = line3()
		let min_int_line
		let p1 = int_line[0]
		let p2 = int_line[1]
		let i1 = target_line[0].i
		let i2 = target_line[1].i
		for (let i = 0, n = point_count(); i < n; i++) {
			if (i == i1 || i == i2) // don't hit target line's endpoints
				continue
			get_point(i, p2)
			target_line.closestPointToPoint(p2, true, p1)
			let ds = p2p_distance2(p1, p2)
			if (ds <= max_d ** 2) {
				if (f && f(int_line) === false)
					continue
				if (ds < min_ds) {
					min_ds = ds
					min_int_line = min_int_line || line3()
					min_int_line[0].copy(p1)
					min_int_line[1].copy(p2)
					min_int_line[1].i = i
				}
			}
		}
		return min_int_line
	}

	function snap_point_on_line(p, line, max_d, p2p_distance2, plane_int_p, axes_int_p) {

		p.i = null
		p.li = line.i
		p.snap = 'line'

		max_d = max_d ** 2
		let mp = line.at(.5, v3())
		let d1 = p2p_distance2(p, line[0])
		let d2 = p2p_distance2(p, line[1])
		let dm = p2p_distance2(p, mp)
		let dp = plane_int_p ? p2p_distance2(p, plane_int_p) : 1/0
		let dx = axes_int_p  ? p2p_distance2(p, axes_int_p ) : 1/0

		if (d1 <= max_d && d1 <= d2 && d1 <= dm && d1 <= dp && d1 <= dx) {
			assign(p, line[0]) // comes with its own point index.
			p.snap = 'point'
		} else if (d2 <= max_d && d2 <= d1 && d2 <= dm && d2 <= dp && d2 <= dx) {
			assign(p, line[1]) // comes with its own point index.
			p.snap = 'point'
		} else if (dp <= max_d && dp <= d1 && dp <= d2 && dp <= dm && dp <= dx) {
			assign(p, plane_int_p) // comes with its own snap flags and indices.
		} else if (dm <= max_d && dm <= d1 && dm <= d2 && dm <= dp && dm <= dx) {
			line.at(.5, p)
			p.snap = 'line_middle'
		} else if (dx <= max_d && dx <= d1 && dx <= d2 && dx <= dm && dx <= dp) {
			assign(p, axes_int_p) // comes with its own snap flags and indices.
		}

	}

	// return the point on closest line from target point.
	function point_hit_lines(p, max_d, p2p_distance2, f, each_line_f) {
		let min_ds = 1/0
		let line = line3()
		let int_p = v3()
		let min_int_p
		each_line_f = each_line_f || each_line
		each_line_f(function(line) {
			line.closestPointToPoint(p, true, int_p)
			let ds = p2p_distance2(p, int_p)
			if (ds <= max_d ** 2) {
				if (!(f && f(int_p, line) === false)) {
					if (ds < min_ds) {
						min_ds = ds
						min_int_p = assign(min_int_p || v3(), int_p)
					}
				}
			}
		})
		return min_int_p
	}

	// return the point on closest face line from target point.
	function point_hit_edge(p, face, max_d, p2p_distance2, f) {
		return point_hit_lines(p, max_d, p2p_distance2, f, f => each_edge(face, f))
	}

	// return the projected point on closest line from target line.
	function line_hit_lines(target_line, max_d, p2p_distance2, clamp, f, each_line_f, is_line_valid) {
		let min_ds = 1/0
		let line = line3()
		let int_line = line3()
		let min_int_p
		each_line_f = each_line_f || each_line
		is_line_valid = is_line_valid || return_true
		each_line_f(function(line) {
			if (is_line_valid(line)) {
				let p1i = line[0].i
				let p2i = line[1].i
				let q1i = target_line[0].i
				let q2i = target_line[1].i
				let touch1 = p1i == q1i || p1i == q2i
				let touch2 = p2i == q1i || p2i == q2i
				if (touch1 != touch2) {
					// skip lines with a single endpoint common with the target line.
				} else if (touch1 && touch2) {
					//
				} else {
					if (target_line.intersectLine(line, clamp, int_line)) {
						let ds = p2p_distance2(int_line[0], int_line[1])
						if (ds <= max_d ** 2) {
							int_line[1].li = line.i
							int_line[1].snap = 'line'
							if (!(f && f(int_line[1], line) === false)) {
								if (ds < min_ds) {
									min_ds = ds
									min_int_p = assign(min_int_p || v3(), int_line[1])
								}
							}
						}
					}
				}
			}
		})
		return min_int_p
	}

	e.line_intersect_face_plane = line_intersect_face_plane
	e.line_hit_points = line_hit_points
	e.snap_point_on_line = snap_point_on_line
	e.point_hit_lines = point_hit_lines
	e.point_hit_edge = point_hit_edge
	e.line_hit_lines = line_hit_lines

	// selection --------------------------------------------------------------

	e.sel_lines = set() // {l1i,...}
	let sel_lines_changed

	{
	let _line = line3()
	e.each_selected_line = function(f) {
		for (let li in e.sel_lines) {
			get_line(li, _line)
			f(_line)
		}
	}}

	function select_all_lines(sel) {
		if (sel)
			for (let i = 0, n = e.line_count(); i < n; i++)
				e.sel_lines.add(i)
		else
			e.sel_lines.clear()
	}

	function face_set_selected(face, sel) {
		face.selected = sel
	}

	function select_all_faces(sel) {
		for (let face of faces)
			face_set_selected(face, sel)
	}

	function select_edges(face, sel) {
		e.each_edge(face, function(line) {
			e.select_line(line.i, sel)
		})
	}

	function select_line_faces(li, sel) {
		e.each_line_face(li, function(face) {
			e.select_face(face, sel)
		})
	}

	e.select_face = function(face, mode, with_lines) {
		if (mode == null) {
			select_all_lines(false)
			select_all_faces(false)
			face_set_selected(face, true)
			if (with_lines)
				select_edges(face, true)
			sel_lines_changed = true
		} else if (mode === true || mode === false) {
			face_set_selected(face, mode)
			if (mode && with_lines) {
				select_edges(face, true)
				sel_lines_changed = true
			}
		} else if (mode == 'toggle') {
			e.select_face(face, !face.selected, with_lines)
		}
	}

	e.select_line = function(li, mode, with_faces) {
		if (mode == null) {
			select_all_faces(false)
			e.sel_lines.clear()
			e.sel_lines.add(li)
			if (with_faces)
				select_line_faces(li, true)
		} else if (mode === true) {
			e.sel_lines.add(li)
			if (with_faces)
				select_line_faces(li, true)
		} else if (mode === false) {
			e.sel_lines.delete(li)
		} else if (mode == 'toggle') {
			e.select_line(li, !e.sel_lines.has(li), with_faces)
		}
		sel_lines_changed = true
	}

	e.select_all = function(sel) {
		if (sel == null) sel = true
		select_all_faces(sel)
		select_all_lines(sel)
		sel_lines_changed = true
	}

	// model editing ----------------------------------------------------------

	e.remove_selection = function() {

		// remove all faces that selected lines are sides of.
		for (let li in e.sel_lines)
			e.each_line_face(li, remove_face)

		// remove all selected faces.
		for (let face of faces)
			if (face.selected)
				remove_face(face)

		// remove all selected lines.
		remove_lines(e.sel_lines)

		// TODO: merge faces.

		select_all_lines(false)
		update_face_lis()
	}

	e.draw_line = function(line) {

		let p1 = line[0]
		let p2 = line[1]

		// check for min. line length for lines with new endpoints.
		if (p1.i == null || p2.i == null) {
			if (p1.distanceToSquared(p2) <= NEARD ** 2)
				return
		} else if (p1.i == p2.i) {
			// check if end point was snapped to start end point.
			return
		}

		let line_ps = [p1, p2] // line's points as an open polygon.

		// cut the line into segments at intersections with existing points.
		line = line3(p1, p2)
		e.line_hit_points(line, NEARD, real_p2p_distance2, function(int_line) {
			let p = int_line[0]
			let i = p.i
			if (i !== p1.i && i !== p2.i) { // exclude end points.
				p = p.clone()
				p.i = i
				line_ps.push(p)
			}
		})

		// sort intersection points by their distance relative to p1
		// so that adjacent points form line segments.
		function sort_line_ps() {
			if (line_ps.length)
				line_ps.sort(function(sp1, sp2) {
					let ds1 = p1.distanceToSquared(sp1)
					let ds2 = p1.distanceToSquared(sp2)
					return ds1 < ds2
				})
		}

		sort_line_ps()

		// check if any of the line segments intersect any existing lines.
		// the ones that do must be broken down further, and so must the
		// existing lines that are cut by them.
		let seg = line3()
		let line_ps_len = line_ps.length
		for (let i = 0; i < line_ps_len-1; i++) {
			seg[0] = line_ps[i]
			seg[1] = line_ps[i+1]
			e.line_hit_lines(seg, NEARD, real_p2p_distance2, true, function(p, line) {
				let li = p.li
				p = p.clone()
				p.li = li
				line_ps.push(p)
			})
		}

		// sort the points again if new points were added.
		if (line_ps.length > line_ps_len)
			sort_line_ps()

		// create missing points.
		for (let p of line_ps)
			if (p.i == null) {
				p.i = add_point(p)
			}

		// create line segments.
		for (let i = 0, len = line_ps.length; i < len-1; i++) {
			let p1i = line_ps[i+0].i
			let p2i = line_ps[i+1].i
			add_line(p1i, p2i)
		}

		// cut intersecting lines in two.
		for (let p of line_ps) {
			if (p.li != null)
				cut_line(p.li, p.i)
		}

	}

	// push/pull --------------------------------------------------------------

	e.start_pull = function(p) {

		let pull = {}

		// pulled face.
		pull.face = p.face

		// pull direction line, starting on the plane and with unit length.
		pull.dir = line3()
		pull.dir[0].copy(p)
		pull.dir[1].copy(p).add(pull.face.plane.normal)

		// faces and lines to exclude when hit-testing while pulling.
		// all moving geometry must be added here.
		let moving_faces = {} // {face: true}
		let moving_lis = {} // {li: true}

		// faces that need re-triangulation while moving.
		let shape_changing_faces = set()

		moving_faces[pull.face] = true

		// pulling only works if the pulled face is connected exclusively to
		// perpendicular (pp) side faces with pp edges at the connection points.
		// when that's not the case, we extend the geometry around the pulled
		// face by either creating new pp faces with pp edges or extending
		// existing pp faces with pp edges. after that, pulling on the face
		// becomes just a matter of moving its points in the pull direction.

		// the algorithm takes two steps: 1) record what needs to be done with
		// the side geometry at each point of the pulled face, 2) perform the
		// modifications, avoiding making duplicate pp edges.
		{
			let new_pp_edge = {} // {pull_ei: true}
			let new_pp_face = {} // {pull_ei: true}
			let ins_edge = map() // {pp_face: [[pp_ei, line_before_point, pull_ei],...]}

			let pull_edge = line3()
			let side_edge = line3()
			let normal = v3()
			let _p = v3()

			let en = pull.face.length

			// for each edge of the pulled face, find all faces that also
			// contain that edge and are pp to the pulled face. there should be
			// at most two such faces per edge.
			// also check for any other non-pp faces connected to the pulled face's points.
			for (let pull_ei = 0; pull_ei < en; pull_ei++) {

				let pp_faces_found = 0
				e.get_edge(pull.face, pull_ei, pull_edge)

				for (let face of faces) {

					if (face != pull.face) { // not the pulled face.

						if (abs(pull.face.plane.normal.dot(face.plane.normal)) < NEARD) { // face is pp.

							let pull_li = pull.face.lis[pull_ei]
							let face_ei = face.lis.indexOf(pull_li)
							if (face_ei != -1) { // face contains our pulled edge, so it's a pp side face.

								pp_faces_found++

								pull_edge.delta(normal).normalize()

								// iterate exactly twice: for prev pp edge and for next pp edge,
								// each of which connects to one of the endpoints of our pulled edge,
								// and we don't know which one, we need to find out.
								for (let i = 0; i <= 1; i++) {

									let side_ei = mod(face_ei - 1 + i * 2, face.length)
									e.get_edge(face, side_ei, side_edge)

									let is_side_edge_pp = abs(side_edge.delta(_p).dot(normal)) < NEARD

									// figure out which endpoint of the pulled edge this side edge connects to.
									let is_first  = side_edge[0].i == pull_edge[0].i || side_edge[1].i == pull_edge[0].i
									let is_second = side_edge[0].i == pull_edge[1].i || side_edge[1].i == pull_edge[1].i
									assert(is_first || is_second)
									let endpoint_ei = (pull_ei + ((is_first) ? 0 : 1)) % en

									if (!is_side_edge_pp) {
										new_pp_edge[endpoint_ei] = true
										shape_changing_faces.add(face)
									}

									// add a command to extend this face with a pp edge if it turns out
									// that the point at `endpoint_ei` will have a pp edge.
									// NOTE: can't call insert_edge() with ei=0. luckily, we don't have to.
									attr(ins_edge, face, Array).push([face_ei + 1, i == 0, endpoint_ei])

								}

							}

						} else { // face is not pp, check if it connects to the pulled face at all.

							// check if face connects to pulled face's point at `ei`
							// and mark the point as needing a pp edge if it does.
							let face_ei = face.indexOf(pull.face[pull_ei])
							if (face_ei != -1) {
								new_pp_edge[pull_ei] = true
							}

						}

					}

				}

				if (!pp_faces_found) {
					new_pp_face[pull_ei] = true
					new_pp_edge[pull_ei] = true
					new_pp_edge[(pull_ei+1) % en] = true
				}

			}

			if (DEBUG) {
				log('pull.start', pull.face.index,
					'edges:'+Object.keys(new_pp_edge).join(','),
					'faces:'+Object.keys(new_pp_face).join(','),
					'insert:'+json(ins_edge).replaceAll('"', '')
				)
			}


			// create pp side edges and adjust pulled face points & edge endpoints.
			let old_points = {} // {ei: pi}
			for (let ei in new_pp_edge) {
				ei = num(ei)
				let old_pi = pull.face[ei]

				// create pp side edge at `ei`.
				let p = get_point(old_pi, _p)
				let new_pi = add_point(p)
				let li = add_line(old_pi, new_pi)
				new_pp_edge[ei] = li

				// replace point in pulled face.
				old_points[ei] = old_pi
				pull.face[ei] = new_pi
				pull.face.invalidate()

				// update the endpoint of pulled face edges that are connected to this point.
				let next_ei = ei
				let prev_ei = mod(ei - 1, en)
				let next_li = pull.face.lis[next_ei]
				let prev_li = pull.face.lis[prev_ei]
				if (!new_pp_face[next_ei]) change_line_endpoint(next_li, new_pi, old_pi)
				if (!new_pp_face[prev_ei]) change_line_endpoint(prev_li, new_pi, old_pi)
			}

			// create pp side faces using newly created pp side edges.
			for (let e1i in new_pp_face) {
				e1i = num(e1i)
				let e2i = (e1i + 1) % en
				let p1i = pull.face[e1i]
				let p2i = pull.face[e2i]
				let side1_li = new_pp_edge[e1i]
				let side2_li = new_pp_edge[e2i]
				let old_pull_li = pull.face.lis[e1i]
				let old_p1i = old_points[e1i]
				let old_p2i = old_points[e2i]

				// create pp side face.
				let pull_li = add_line(p1i, p2i)
				let face = add_face(
					[old_p1i, old_p2i, p2i, p1i],
					[old_pull_li, side2_li, pull_li, side1_li]
				)

				// replace edge in pulled face.
				pull.face.lis[e1i] = pull_li
			}

			// extend pp faces with newly created pp side edges.
			for (let [pp_face, t] in ins_edge) {
				let insert_offset = 0
				for (let [pp_ei, line_before_point, pull_ei] of t) {
					let pull_pi = pull.face[pull_ei]
					let pp_li = new_pp_edge[pull_ei]
					if (pp_li != null) {
						insert_edge(pp_face, pp_ei + insert_offset, pull_pi, line_before_point, pp_li)
						insert_offset++
					}
				}
			}

		}

		pull.can_hit = function(p) {
			return (!(moving_faces[p.face] || moving_lis[p.li]))
		}

		{
			let initial_ps = pull.face.map(pi => get_point(pi))

			let delta = v3()
			let _p = v3()

			pull.pull = function(p) {

				pull.dir.closestPointToPoint(p, false, delta)
				delta.sub(pull.dir[0])

				let i = 0
				for (let pi of pull.face) {
					_p.copy(initial_ps[i++]).add(delta)
					e.move_point(pi, _p.x, _p.y, _p.z)
				}
				for (let face of shape_changing_faces)
					face.invalidate()
				pull.face.invalidate()

			}
		}

		pull.stop = function() {
			// TODO: make hole, etc.
			if (DEBUG)
				log('pull.stop')
		}

		pull.cancel = function() {
			// TODO
			if (DEBUG)
				print('pull.cancel')
		}

		return pull
	}

	// rendering --------------------------------------------------------------

	let points_dab           = gl && gl.dyn_arr_v3_buffer() // coords for points and lines
	let used_pis_dab         = gl && gl.dyn_arr_u32_index_buffer() // points index buffer
	let vis_edge_lis_dab     = gl && gl.dyn_arr_u32_index_buffer() // black thin lines
	let inv_edge_lis_dab     = gl && gl.dyn_arr_u32_index_buffer() // black dashed lines
	let sel_inv_edge_lis_dab = gl && gl.dyn_arr_u32_index_buffer() // blue dashed lines

	let points_rr             = gl.points_renderer()
	let faces_rr              = gl.faces_renderer()
	let black_thin_lines_rr   = gl.solid_lines_renderer()
	let black_dashed_lines_rr = gl.dashed_lines_renderer({dash: 5, gap: 3})
	let blue_dashed_lines_rr  = gl.dashed_lines_renderer({dash: 5, gap: 3, base_color: 0x0000ff})
	let black_fat_lines_rr    = gl.fat_lines_renderer({})
	let blue_fat_lines_rr     = gl.fat_lines_renderer({base_color: 0x0000ff})

	function free() {
		points_dab            .free()
		used_pis_dab          .free()
		vis_edge_lis_dab      .free()
		inv_edge_lis_dab      .free()
		sel_inv_edge_lis_dab  .free()

		points_rr             .free()
		faces_rr              .free()
		black_thin_lines_rr   .free()
		black_dashed_lines_rr .free()
		blue_dashed_lines_rr  .free()
		black_fat_lines_rr    .free()
		blue_fat_lines_rr     .free()

		camera_ubo            .free()
	}

	let _pa = new f32arr(3)
	function upload_point(pi, x, y, z) {
		let pn = point_count()
		if (points_dab && points_dab.len >= pn) {
			_pa[0] = x
			_pa[1] = y
			_pa[2] = z
			points_dab.set(_pa, pi).upload()
		} else {
			points_changed = true
		}
	}

	e.show_invisible_lines = true

	e.toggle_invisible_lines = function() {
		e.show_invisible_lines = !e.show_invisible_lines
		used_lines_changed = true
	}

	function each_nonedge_line(f) {
		for (let li = 0, n = line_count(); li < n; li++)
			if (lines[5*li+2] == 1) // rc: is standalone.
				f(get_line(li))
	}

	function each_sel_vis_line(f) {
		for (li of e.sel_lines)
			if (lines[5*li+4] > 0) // opacity: is visible.
				f(get_line(li))
	}

	function draw(prog, models_buf) {

		if (points_changed) {
			points_dab.len = point_count()
			points_dab.set(points).upload()

			points_rr             .pos = points_dab.buffer
			black_thin_lines_rr   .pos = points_dab.buffer
			black_dashed_lines_rr .pos = points_dab.buffer
			blue_dashed_lines_rr  .pos = points_dab.buffer
		}

		if (used_points_changed) {
			let pn = point_count()
			used_pis_dab.len = pn

			let i = 0
			let is = used_pis_dab.array
			for (let pi = 0; pi < pn; pi++)
				if (prc[pi]) // is used
					is[i++] = pi

			used_pis_dab.len = i
			used_pis_dab.upload()

			points_rr.index = used_pis_dab.buffer
		}

		if (used_lines_changed) {
			let vln = edge_line_count
			let iln = e.show_invisible_lines ? vln : 0

			let vdab  = vis_edge_lis_dab
			let idab  = inv_edge_lis_dab

			vdab.len  = vln
			idab.len  = iln

			let vi = 0
			let ii = 0
			let vs = vdab.array
			let is = idab.array
			for (let i = 0, n = lines.length; i < n; i += 5) {
				if (lines[i+2] >= 2) { // refcount: is edge
					let p1i = lines[i+0]
					let p2i = lines[i+1]
					if (lines[i+4] > 0) { // opacity: is not invisible
						vs[vi++] = p1i
						vs[vi++] = p2i
					} else if (is) {
						is[ii++] = p1i
						is[ii++] = p2i
					}
				}
			}

			vdab.len = vi
			idab.len = ii

			vdab.upload()
			idab.upload()

			black_thin_lines_rr   .index = vdab.buffer
			black_dashed_lines_rr .index = idab.buffer
		}

		if (e.show_invisible_lines) {
			let ln = e.show_invisible_lines ? e.sel_lines.size : 0
			let dab = sel_inv_edge_lis_dab
			dab.len = ln
			let i = 0
			let is = dab.array
			if (is) {
				for (let li in e.sel_lines) {
					if (lines[5*li+4] == 0) { // opacity: is invisible.
						let p1i = lines[5*li+0]
						let p2i = lines[5*li+1]
						is[i++] = p1i
						is[i++] = p2i
					}
				}
			}
			dab.len = i

			blue_dashed_lines_rr.index = dab.buffer
		}

		for (let mesh of meshes)
			if (!mesh.normals_valid)
				for (let face of mesh)
					for (let i = 0, teis = face.triangles(), n = teis.length; i < n; i++) {
						let pi = face[teis[i]]
						normals[3*pi+0] = 0
						normals[3*pi+1] = 0
						normals[3*pi+2] = 0
					}

		for (let mesh of meshes)
			if (!mesh.normals_valid)
				for (let face of mesh)
					face.compute_smooth_normals(normals)

		faces_rr.update(mat_faces_map)

		if (points_changed || used_lines_changed)
			black_fat_lines_rr.update(each_nonedge_line, nonedge_line_count)

		if (points_changed || sel_lines_changed)
			blue_fat_lines_rr.update(each_sel_vis_line, e.sel_lines.size)

		points_rr             .model = models_buf
		faces_rr              .model = models_buf
		black_thin_lines_rr   .model = models_buf
		black_dashed_lines_rr .model = models_buf
		blue_dashed_lines_rr  .model = models_buf
		black_fat_lines_rr    .model = models_buf
		blue_fat_lines_rr     .model = models_buf

		if (prog && prog.name == 'face_id') {
			faces_rr.draw(prog)
		} else {
			points_rr             .draw(prog)
			faces_rr              .draw(prog)
			black_thin_lines_rr   .draw(prog)
			black_dashed_lines_rr .draw(prog)
			blue_dashed_lines_rr  .draw(prog)
			black_fat_lines_rr    .draw(prog)
			blue_fat_lines_rr     .draw(prog)
		}

		points_changed      = false
		used_points_changed = false
		used_lines_changed  = false
		sel_lines_changed   = false

	}

	e.free = free
	e.draw = draw

	return e
}

}()) // module scope.
