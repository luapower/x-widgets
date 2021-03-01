/*

	3D model editor widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

// primitive construction ----------------------------------------------------

function v2(x, y)        { return new THREE.Vector2(x, y) }
function v3(x, y, z)     { return new THREE.Vector3(x, y, z) }
function line3(p1, p2)   { return new THREE.Line3(p1, p2) }
function color3(c)       { return new THREE.Color(c) }
function mat3()          { return new THREE.Matrix3() }
function mat4()          { return new THREE.Matrix4() }
function quaternion()    { return new THREE.Quaternion() }

function point_buffer(n) {
	return new THREE.BufferAttribute(new Float32Array(3 * n), 3).setUsage(THREE.DynamicDrawUsage)
}

function index_buffer(n, maxn) {
	let T = or(maxn, n) > 65535 ? UInt32Array : Uint16Array
	return new THREE.BufferAttribute(new T(n), 1).setUsage(THREE.DynamicDrawUsage)
}

function int8_buffer(n) {
	return new THREE.BufferAttribute(new Int8Array(n), 1).setUsage(THREE.DynamicDrawUsage)
}

function uint32_buffer(n) {
	return new THREE.BufferAttribute(new Uint32Array(n), 1).setUsage(THREE.DynamicDrawUsage)
}

function mat4_instance_buffer(n) {
	return new THREE.InstancedBufferAttribute(new Float32Array(16 * n), 16).setUsage(THREE.DynamicDrawUsage)
}

(function() {

let DEBUG = 1
let NEARD = 1e-5   // distance epsilon (tolerance)

// colors --------------------------------------------------------------------

let white = 0xffffff
let black = 0x000000
let selected_color = 0x0000ff
let ref_color = 0xff00ff
let z_axis_color = 0x006600
let x_axis_color = 0x990000
let y_axis_color = 0x000099

let sky_color     = 0xccddff
let horizon_color = 0xffffff
let ground_color  = 0xe0dddd

// disable THREE.js UUID generation ------------------------------------------

{ let n = 0; THREE.Math.generateUUID = () => ++n }

// point-to-screen projection ------------------------------------------------

{
	let p = v3()
	THREE.Vector3.prototype.project_to_canvas = function(camera, out) {
		p.copy(this).project(camera)
		out.x = round(( p.x + 1) * camera.canvas.width  / 2)
		out.y = round((-p.y + 1) * camera.canvas.height / 2)
		out.z = 0
		return out
	}
}

// line-line intersection ----------------------------------------------------

{
	let mp = v3()
	let mq = v3()
	let qp = v3()
	let rp = v3()
	let rq = v3()
	let p1 = v3()
	let p2 = v3()
	let line = line3(rp, rq)

	// returns the smallest line that connects two (coplanar or skewed) lines.
	// returns null for parallel lines.
	THREE.Line3.prototype.intersectLine = function intersectLine(lq, clamp, out) {

		let lp = this
		let p = lp.start
		let q = lq.start
		lp.delta(mp)
		lq.delta(mq)
		qp.copy(p).sub(q)

		let qp_mp = qp.dot(mp)
		let qp_mq = qp.dot(mq)
		let mp_mp = mp.dot(mp)
		let mq_mq = mq.dot(mq)
		let mp_mq = mp.dot(mq)

		let detp = qp_mp * mq_mq - qp_mq * mp_mq
		let detq = qp_mp * mp_mq - qp_mq * mp_mp
		let detm = mp_mq * mp_mq - mq_mq * mp_mp

		if (detm == 0) // lines are parallel
			return

		rp.copy(p).add(mp.multiplyScalar(detp / detm))
		rq.copy(q).add(mq.multiplyScalar(detq / detm))

		if (clamp) {
			p1.copy(lp.end).sub(lp.start)
			p2.copy(rp).sub(lp.start)
			let tp = p2.length() / p1.length() * (p1.dot(p2) > 0 ? 1 : -1)
			p1.copy(lq.end).sub(lq.start)
			p2.copy(rq).sub(lq.start)
			let tq = p2.length() / p1.length() * (p1.dot(p2) > 0 ? 1 : -1)
			if (tp < 0)
				rp.copy(lp.start)
			else if (tp > 1)
				rp.copy(lp.end)
			if (tq < 0)
				rq.copy(lq.start)
			else if (tq > 1)
				rq.copy(lq.end)
		}

		return out.copy(line)
	}
}

// region-finding algorithm --------------------------------------------------

// The algorithm below is O(n log n) and it's from the paper:
//   "An optimal algorithm for extracting the regions of a plane graph"
//   X.Y. Jiang and H. Bunke, 1992.

// return a number from the range [0..4] which is monotonic
// in the angle that the input vector makes against the x axis.
function v2_pseudo_angle(dx, dy) {
	let p = dx / (abs(dx) + abs(dy))  // -1..1 increasing with x
	return dy < 0 ? 3 + p : 1 - p     //  2..4 or 0..2 increasing with x
}

{
	let quat = quaternion()
	let xy_normal = v3(0, 0, 1)

	function plane_graph_regions(plane_normal, get_point, lines) {

		quat.setFromUnitVectors(plane_normal, xy_normal)

		// phase 1: find all wedges.

		// step 1+2: make pairs of directed edges from all the edges and compute
		// their angle-to-horizontal so that they can be then sorted by that angle.
		let edges = [] // [[p1i, p2i, angle], ...]
		let p1 = v3()
		let p2 = v3()
		for (let i = 0, n = lines.length / 2; i < n; i++) {
			let p1i = lines[2*i+0]
			let p2i = lines[2*i+1]
			get_point(p1i, p1).applyQuaternion(quat)
			get_point(p2i, p2).applyQuaternion(quat)
			edges.push(
				[p1i, p2i, v2_pseudo_angle(p2.x - p1.x, p2.y - p1.y)],
				[p2i, p1i, v2_pseudo_angle(p1.x - p2.x, p1.y - p2.y)])
		}

		// step 3: sort by edges by (p1, angle).
		edges.sort(function(e1, e2) {
			if (e1[0] == e2[0])
				return e1[2] < e2[2] ? -1 : (e1[2] > e2[2] ? 1 : 0)
			else
				return e1[0] < e2[0] ? -1 : 1
		})

		// for (let e of edges) { print('e', e[0]+1, e[1]+1) }

		// step 4: make wedges from edge groups formed by edges with the same p1.
		let wedges = [] // [[p1i, p2i, p3i, used], ...]
		let wedges_first_pi = edges[0][1]
		for (let i = 0; i < edges.length; i++) {
			let edge = edges[i]
			let next_edge = edges[i+1]
			let same_group = next_edge && edge[0] == next_edge[0]
			if (same_group) {
				wedges.push([edge[1], edge[0], next_edge[1], false])
			} else {
				wedges.push([edge[1], edge[0], wedges_first_pi, false])
				wedges_first_pi = next_edge && next_edge[1]
			}
		}

		// for (let w of wedges) { print('w', w[0]+1, w[1]+1, w[2]+1) }

		// phase 2: group wedges into regions.

		// step 1: sort wedges by (p1, p2) so we can binsearch them by the same key.
		wedges.sort(function(w1, w2) {
			if (w1[0] == w2[0])
				return w1[1] < w2[1] ? -1 : (w1[1] > w2[1] ? 1 : 0)
			else
				return w1[0] < w2[0] ? -1 : 1
		})

		// for (let w of wedges) { print('w', w[0]+1, w[1]+1, w[2]+1) }

		// step 2: mark all wedges as unused (already did on construction).
		// step 3, 4, 5: find contiguous wedges and group them into regions.
		// NOTE: the result also contans the outer region which goes clockwise
		// while inner regions go anti-clockwise.
		let regions = [] // [[p1i, p2i, ...], ...]
		let k = [0, 0] // reusable (p1i, p2i) key for binsearch.
		function cmp_wedges(w1, w2) { // binsearch comparator on wedge's (p1i, p2i).
			return w1[0] == w2[0] ? w1[1] < w2[1] : w1[0] < w2[0]
		}
		for (let i = 0; i < wedges.length; i++) {
			let w0 = wedges[i]
			if (w0[3])
				continue // skip wedges marked used
			region = [w0[1]]
			regions.push(region)
			k[0] = w0[1]
			k[1] = w0[2]
			while (1) {
				let i = wedges.binsearch(k, cmp_wedges)
				let w = wedges[i]
				region.push(w[1])
				w[3] = true // mark used so we can skip it
				if (w[1] == w0[0] && w[2] == w0[1]) // cycle complete.
					break
				k[0] = w[1]
				k[1] = w[2]
			}
		}

		// for (let r of regions) { print('r', r.map(i => i+1)) }

		return regions
	}

	function test_plane_graph_regions() {
		let points = [
			v3(0, -5, 0),
			v3(-10, 0, 0), v3(10, 0, 0), v3(-10, 5, 0), v3(10, 5, 0),
			//v3(-5, 1, 0), v3(5,  1, 0), v3(-5, 4, 0), v3(5, 4, 0),
			//v3(0, -1, 0), v3(1, -2, 0),
		]
		let get_point = function(i, out) { out.copy(points[i]); return out }
		let lines  = [0,1, 0,2,  1,2, 1,3, 2,4, 3,4,  ] // 5,6, 5,7, 6,8, 7,8,  0,9, 9,10]
		let rt = plane_graph_regions(v3(0, 0, 1), get_point, lines)
		for (let r of rt) { print(r.map(i => i+1)) }
	}
	// test_plane_graph_regions()
}

// dashed line material ------------------------------------------------------

// works with LineSegments().
// the `canvas` uniform must be updated when canvas is resized.

function dashed_line_material(opt) {

	let vshader = `
		attribute mat4 instance_matrix;
		flat out vec4 p2; // because GL_LAST_VERTEX_CONVENTION
		out vec4 p;
		void main() {
			p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			gl_Position = p;
			p2 = p;
		}
	`

	let fshader = `
		precision highp float;
		flat in vec4 p2;
		in vec4 p;
		uniform vec3 color;
		uniform vec2 canvas;
		uniform float dash;
		uniform float gap;
		void main(){
			float dist = length(((p.xyz / p.w).xy - (p2.xyz / p2.w).xy) * canvas.xy / 2.0);
			if (fract(dist / (dash + gap)) > dash / (dash + gap))
				discard;
			gl_FragColor = vec4(color.rgb, 1.0);
		}
	`

	let uniforms = {
		 canvas : {type: 'v2', value: {x: 0, y: 0}},
		 dash   : {type: 'f' , value: or(opt.dash, 1)},
		 gap    : {type: 'f' , value: or(opt.gap, 3)},
		 color  : {value: color3(or(opt.color, black))},
	}

	let mat = new THREE.ShaderMaterial({
			uniforms       : uniforms,
			vertexShader   : vshader,
			fragmentShader : fshader,
		})

	return mat

}

// editable models -----------------------------------------------------------

// models are comprised of polygons enclosed and connected by lines defined
// over a common point cloud, plus standalone lines plus any child models.

// The editing API implements the direct manipulation UI and is designed to
// perform automatic creation/removal/intersection of points/lines/polygons
// while keeping the model numerically stable and clean. In particular:
// - editing operations never leave duplicate points/lines/polygons.
// - existing points are never moved when adding new geometry.
// - when existing lines are cut, straightness is preserved to best accuracy.

function real_p2p_distance2(p1, p2) { // stub
	return p1.distanceToSquared(p2)
}

function editable_model(e) {

	// undo/redo stacks -------------------------------------------------------

	{
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

		function _undo(stack, start) {
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
			_undo(stack, start)
			undo_groups = groups
			undo_stack  = stack
		}

		function redo() {
			_undo(redo_stack, redo_groups.pop())
		}
	}

	// model ------------------------------------------------------------------

	let points    = [] // [(x, y, z), ...]
	let normals   = [] // [(x, y, z), ...]
	let free_pis  = [] // [p1i,...]; freelist of point indices.
	let prc       = [] // [rc1,...]; ref counts of points.
	let lines     = [] // [(p1i, p2i, rc, sm, op), ...]; rc=refcount, sm=smoothness, op=opacity.
	let free_lis  = [] // [l1i,...]; freelist of line indices.
	let faces     = set() // {[p1i, p2i, ..., lis: [line1i,...], selected:, material:, mesh:, ]}
	let meshes    = set() // {{face},...}; meshes are sets of all faces connected by smooth lines.
	let materials = []    // [mat1,...]
	let inst_mat  = [] // [mat4_1, ...]; instance position/scale/rotation matrices.

	let child_models = [] // [model1, ...]
	let child_mats   = [] // [mat1, ...]

	// model-to-view info.
	let points_changed    // time to reload points_buf.
	let normals_changed   // time to reload normals_buf.
	let used_points_changed     // time to reload the used_pis_buf.
	let used_lines_changed      // time to reload *_edge_lis_buf.
	let edge_line_count = 0     // number of face edge lines.
	let nonedge_line_count = 0  // number of standalone lines.
	let inst_mat_changed

	if (DEBUG) {
		window.materials = materials
		window.faces = faces
		window.lines = lines
	}

	// low-level model editing API that:
	// - records undo ops in the undo stack.
	// - updates and/or invalidates any affected view buffers.

	e.point_count = () => prc.length

	{
		let p = v3()
		e.get_point = function(pi, out) {
			out = out || p
			out.x = points[3*pi+0]
			out.y = points[3*pi+1]
			out.z = points[3*pi+2]
			out.i = pi
			return out
		}
	}

	function set_xyz(a, pi, x, y, z) {
		a[3*pi+0] = x
		a[3*pi+1] = y
		a[3*pi+2] = z
	}

	e.add_point = function(x, y, z, need_pi) {

		let pi = free_pis.pop()
		if (pi == null) {
			points.push(x, y, z)
			normals.push(0, 0, 0)
			pi = prc.length
		} else {
			set_xyz(points, pi, x, y, z)
			set_xyz(normals, 0, 0, 0)
		}
		prc[pi] = 0

		if (need_pi != null)
			assert(pi == need_pi)

		update_point(pi, x, y, z)

		if (DEBUG)
			print('add_point', pi, x+','+y+','+z)

		return pi
	}

	let unref_point = function(pi) {

		let rc0 = prc[pi]--
		assert(rc0 > 0)

		if (rc0 == 1) {

			free_pis.push(pi)
			used_points_changed = true

			let p = e.get_point(pi)
			push_undo(e.add_point, p.x, p.y, p.z, pi)

		}

		push_undo(ref_point, pi)

		// if (DEBUG) print('unref_point', pi, prc[pi])
	}

	let ref_point = function(pi) {

		let rc0 = prc[pi]++

		if (rc0 == 0)
			used_points_changed = true

		push_undo(unref_point, pi)

		// if (DEBUG) print('ref_point', pi, prc[pi])
	}

	e.move_point = function(pi, x, y, z) {
		let p = e.get_point(pi)
		set_xyz(points, pi, x, y, z)
		update_point(pi, x, y, z)
		push_undo(e.move_point, pi, x0, y0, z0)
	}

	e.line_count = () => lines.length / 5

	{
		let line = line3()
		e.get_line = function(li, out) {
			out = out || line
			let p1i = lines[5*li+0]
			let p2i = lines[5*li+1]
			e.get_point(p1i, out.start)
			e.get_point(p2i, out.end)
			out.i = li
			return out
		}
	}

	e.each_line = function(f) {
		for (let li = 0, n = e.line_count(); li < n; li++)
			if (lines[5*li+2]) // ref count: used.
				f(e.get_line(li))
	}

	e.add_line = function(p1i, p2i, need_li) {

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

		push_undo(e.unref_line, li)

		if (DEBUG)
			print('add_line', li, p1i+','+p2i)

		return li
	}

	e.unref_line = function(li) {

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

			push_undo(e.add_line, p1i, p2i, li)

			if (DEBUG)
				print('remove_line', li)

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

		// if (DEBUG) print('unref_line', li, lines[5*li+2])
	}

	let ref_line = function(li) {

		let rc0 = lines[5*li+2]++

		if (rc0 == 1) {
			nonedge_line_count--
			edge_line_count++
			used_lines_changed = true
		} else {
			assert(rc0 > 1)
			edge_line_count++
		}

		push_undo(e.unref_line, li)

		// if (DEBUG) print('ref_line', li, lines[5*li+2])
	}

	e.add_material = function(opt) {
		let mat = face_mesh_material(opt)
		mat.faces = []
		let mi = materials.push(mat) - 1
		mat.mi = mi
		return mat
	}

	e.get_edge = function(face, ei, out) {
		out = e.get_line(face.lis[ei], out)
		out.ei = ei // edge index.
		if (out.end.i == face[ei]) { // fix edge endpoints order.
			let p1 = out.start
			let p2 = out.end
			out.start = p2
			out.end   = p1
		}
		return out
	}

	e.each_edge = function(face, f) {
		for (let ei = 0, n = face.length; ei < n; ei++)
			f(e.get_edge(face, ei))
	}

	let next_face_id = 0
	function add_face(face) {
		let id = next_face_id++
		for (let pi of face)
			ref_point(pi)
		if (!face.lis)
			update_face_lis(face)
		else
			for (let li of face.lis)
				ref_line(li)
		face.id = id
		face.material = face.material || materials[0]
		face.material.faces.push(face)
		face.triangles = []
		faces.add(face)
		if (DEBUG)
			print('add_face', id, face.join(','), face.lis.join(','))
		return id
	}

	function remove_face(face) {
		faces.delete(face)
		for (let li of face.lis)
			e.unref_line(li)
		for (let pi of face)
			unref_point(pi)
		face.material.faces.remove_value(face)
		if (DEBUG)
			print('remove_face', face.id)
	}

	e.set_material = function(face, mat) {
		face.material.faces.remove_value(face)
		face.material = mat
		mat.faces.push(face)
		if (DEBUG)
			print('set_material', face.id, mat.mi)
	}

	function ref_or_add_line(p1i, p2i) {
		let found_li
		for (let li = 0, n = e.line_count(); li < n; li++) {
			let _p1i = lines[5*li+0]
			let _p2i = lines[5*li+1]
			if ((_p1i == p1i && _p2i == p2i) || (_p1i == p2i && _p2i == p1i)) {
				found_li = li
				break
			}
		}
		let li = found_li != null ? found_li : e.add_line(p1i, p2i)
		ref_line(li)
		return li
	}

	function update_face_lis(face) {
		face.lis = face.lis || []
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
			print('insert_edge', face.id, '@'+ei, 'pi='+pi, '@'+line_ei, 'li='+li, 'before_pi='+face[ei])
		face.insert(ei, pi)
		face.lis.insert(line_ei, li)
		face.triangle_coords = null
	}

	e.each_line_face = function(li, f) {
		for (let face of faces)
			if (face.lis.includes(li))
				f(face)
	}

	{
		let common_meshes = set()
		let nomesh_faces = []

		e.set_line_smoothness = function(li, sm) {

			let sm0 = lines[5*li+3]
			if (sm == sm0)
				return

			push_undo(e.set_line_smoothness, li, sm0)

			if (!sm0 == !sm) // smoothness category hasn't changed.
				return

			lines[5*li+3] = sm

			if (sm > 0) { // line has gotten smooth.

				e.each_line_face(li, function(face) {
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
				e.each_line_face(li, function(face) {
					assert(!target_mesh || target_mesh == mesh) // one mesh only.
					target_mesh = face.mesh
					// TODO: this is not right.
					face.mesh.delete(face)
					face.mesh = null
				})

				// remove the mesh if it became empty.
				if (target_mesh.size == 0)
					meshes.delete(target_mesh)

			}

			common_meshes.clear()
			nomesh_faces.length = 0
		}
	}

	e.set_line_opacity = function(li, op) {

		let op0 = lines[5*li+4]
		if (op == op0)
			return

		push_undo(e.set_line_opacity, li, op0)

		if (!op0 == !op) // opacity category hasn't changed.
			return

		lines[5*li+4] = op
		used_lines_changed = true

	}

	e.set = function(t) {

		points.length = 0
		if (t.points)
			for (let i = 0, n = t.points.length; i < n; i += 3)
				e.add_point(
					t.points[i+0],
					t.points[i+1],
					t.points[i+2]
				)

		lines.length = 0
		if (t.lines)
			for (let i = 0, n = t.lines.length; i < n; i += 2)
				add_line(t.lines[i], t.lines[i+1])

		faces.clear()
		if (t.faces)
			for (let face of t.faces)
				add_face(face)

	}

	e.instance_count = () => inst_mat.length / 16

	{
		let m = mat4()
		e.get_instance_matrix = function(i, out) {
			out = out || m
			out.fromArray(inst_mat, 16 * i)
			out.i = i
			return out
		}
	}

	e.add_instance = function(m) {
		m.toArray(inst_mat, inst_mat.length)
		inst_mat_changed = true
		if (DEBUG)
			print('add_instance', m.elements.join(','))
	}

	// face plane -------------------------------------------------------------

	{
		let xy_normal = v3(0, 0, 1)
		let p1 = v3()
		let p2 = v3()
		let pn = v3()
		function update_face_plane(face, normal) {
			if (face.valid)
				return
			assert(face.length >= 3)

			face.plane = face.plane || new THREE.Plane()
			face.plane.face = face

			if (normal) {
				e.get_point(face[0], p1)
				face.plane.setFromNormalAndCoplanarPoint(normal, p1)
			} else {
				// compute plane normal using Newell's method.
				pn.set(0, 0, 0)
				e.get_point(face[0], p1)
				for (let i = 1, n = face.length; i <= n; i++) {
					e.get_point(face[i % n], p2)
					pn.x += (p1.y - p2.y) * (p1.z + p2.z)
					pn.y += (p1.z - p2.z) * (p1.x + p2.x)
					pn.z += (p1.x - p2.x) * (p1.y + p2.y)
					p1.copy(p2)
				}
				pn.normalize()
				face.plane.setFromNormalAndCoplanarPoint(pn, p1)
			}

			// the xy quaternion rotates face's plane to the xy-plane so we can do
			// 2d geometry like triangulation on its points.
			face.xy_quaternion = face.xy_quaternion || quaternion()
			face.xy_quaternion.setFromUnitVectors(face.plane.normal, xy_normal)

			face.valid = face.plane.normal.lengthSq() > .5
		}
	}

	e.face_plane = function(face) {
		update_face_plane(face)
		return face.plane
	}

	function face_center(face, c) {
		c = c || v3()
		let p = v3()
		for (let pi of face) {
			e.get_point(pi, p)
			c.add(p)
		}
		let en = face.length
		c.x = c.x / en
		c.y = c.y / en
		c.z = c.z / en
		return c
	}

	// hit testing & snapping -------------------------------------------------

	e.line_intersect_face_plane = function(line, face) {
		let plane = e.face_plane(face)
		let d1 = plane.distanceToPoint(line.start)
		let d2 = plane.distanceToPoint(line.end)
		if ((d1 < -NEARD && d2 > NEARD) || (d2 < -NEARD && d1 > NEARD)) {
			let int_p = plane.intersectLine(line, v3())
			if (int_p) {
				int_p.face = face
				int_p.snap = 'line_plane_intersection'
				return int_p
			}
		}
	}

	{
		let _raycaster = new THREE.Raycaster()
		let _p = v3()
		let ht = []
		e.line_intersects_face = function(line, face, line_start_in_front_of_plane) {
			let p1, p2
			if (line_start_in_front_of_plane) {
				p1 = line.start
				p2 = line.end
			} else {
				p1 = line.end
				p2 = line.start
			}
			let line_dir = _p.copy(p2).sub(p1).setLength(1)
			_raycaster.ray.set(p1, line_dir)
			ht.length = 0
			// TODO: redo this
			return false
			return _raycaster.intersectObject(face.mesh, false, ht).length > 0
		}
	}

	// return the line from target line to its closest point
	// with the point index in line.end.i.
	e.line_hit_points = function(target_line, max_d, p2p_distance2, f) {
		let min_ds = 1/0
		let int_line = line3()
		let min_int_line
		let p1 = int_line.start
		let p2 = int_line.end
		let i1 = target_line.start.i
		let i2 = target_line.end.i
		for (let i = 0, n = e.point_count(); i < n; i++) {
			if (i == i1 || i == i2) // don't hit target line's endpoints
				continue
			e.get_point(i, p2)
			target_line.closestPointToPoint(p2, true, p1)
			let ds = p2p_distance2(p1, p2)
			if (ds <= max_d ** 2) {
				if (f && f(int_line) === false)
					continue
				if (ds < min_ds) {
					min_ds = ds
					min_int_line = min_int_line || line3()
					min_int_line.start.copy(p1)
					min_int_line.end.copy(p2)
					min_int_line.end.i = i
				}
			}
		}
		return min_int_line
	}

	e.snap_point_on_line = function(p, line, max_d, p2p_distance2, plane_int_p, axes_int_p) {

		p.i = null
		p.li = line.i
		p.snap = 'line'

		max_d = max_d ** 2
		let mp = line.at(.5, v3())
		let d1 = p2p_distance2(p, line.start)
		let d2 = p2p_distance2(p, line.end)
		let dm = p2p_distance2(p, mp)
		let dp = plane_int_p ? p2p_distance2(p, plane_int_p) : 1/0
		let dx = axes_int_p  ? p2p_distance2(p, axes_int_p ) : 1/0

		if (d1 <= max_d && d1 <= d2 && d1 <= dm && d1 <= dp && d1 <= dx) {
			assign(p, line.start) // comes with its own point index.
			p.snap = 'point'
		} else if (d2 <= max_d && d2 <= d1 && d2 <= dm && d2 <= dp && d2 <= dx) {
			assign(p, line.end) // comes with its own point index.
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
	e.point_hit_lines = function(p, max_d, p2p_distance2, f, each_line) {
		let min_ds = 1/0
		let line = line3()
		let int_p = v3()
		let min_int_p
		each_line = each_line || e.each_line
		each_line(function(line) {
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
	e.point_hit_edges = function(p, face, max_d, p2p_distance2, f) {
		return e.point_hit_lines(p, max_d, p2p_distance2, f, f => e.each_edge(face, f))
	}

	// return the projected point on closest line from target line.
	e.line_hit_lines = function(target_line, max_d, p2p_distance2, clamp, f, each_line, is_line_valid) {
		let min_ds = 1/0
		let line = line3()
		let int_line = line3()
		let min_int_p
		each_line = each_line || e.each_line
		is_line_valid = is_line_valid || return_true
		each_line(function(line) {
			if (is_line_valid(line)) {
				let p1i = line.start.i
				let p2i = line.end.i
				let q1i = target_line.start.i
				let q2i = target_line.end.i
				let touch1 = p1i == q1i || p1i == q2i
				let touch2 = p2i == q1i || p2i == q2i
				if (touch1 != touch2) {
					// skip lines with a single endpoint common with the target line.
				} else if (touch1 && touch2) {
					//
				} else {
					if (target_line.intersectLine(line, clamp, int_line)) {
						let ds = p2p_distance2(int_line.start, int_line.end)
						if (ds <= max_d ** 2) {
							int_line.end.li = line.i
							int_line.end.snap = 'line'
							if (!(f && f(int_line.end, line) === false)) {
								if (ds < min_ds) {
									min_ds = ds
									min_int_p = assign(min_int_p || v3(), int_line.end)
								}
							}
						}
					}
				}
			}
		})
		return min_int_p
	}

	// selection --------------------------------------------------------------

	e.sel_lines = set() // {l1i,...}
	let sel_lines_changed

	{
		let _line = line3()
		e.each_selected_line = function(f) {
			for (let li in e.sel_lines) {
				e.get_line(li, _line)
				f(_line)
			}
		}
	}

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

		let p1 = line.start
		let p2 = line.end

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
			let p = int_line.start
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
			seg.start = line_ps[i]
			seg.end   = line_ps[i+1]
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
		pull.dir.start.copy(p)
		pull.dir.end.copy(p).add(pull.face.plane.normal)

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
									let is_first  = side_edge.start.i == pull_edge.start.i || side_edge.end.i == pull_edge.start.i
									let is_second = side_edge.start.i == pull_edge.end.i   || side_edge.end.i == pull_edge.end.i
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
				print('pull.start', pull.face.id,
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
				let p = e.get_point(old_pi, _p)
				let new_pi = add_point(p)
				let li = add_line(old_pi, new_pi)
				new_pp_edge[ei] = li

				// replace point in pulled face.
				old_points[ei] = old_pi
				pull.face[ei] = new_pi
				face_points_changed(pull.face)

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
				let pis = [old_p1i, old_p2i, p2i, p1i]
				let lis = [old_pull_li, side2_li, pull_li, side1_li]
				let face = pis; face.lis = lis
				add_face(face)

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
			let initial_ps = pull.face.map(pi => e.get_point(pi))

			let delta = v3()
			let _p = v3()

			pull.pull = function(p) {

				pull.dir.closestPointToPoint(p, false, delta)
				delta.sub(pull.dir.start)

				let i = 0
				for (let pi of pull.face) {
					_p.copy(initial_ps[i++]).add(delta)
					e.move_point(pi, _p.x, _p.y, _p.z)
				}
				for (let face of shape_changing_faces)
					face_points_changed(face)
				face_points_changed(pull.face)

			}
		}

		pull.stop = function() {
			// TODO: make hole, etc.
			if (DEBUG)
				print('pull.stop')
		}

		pull.cancel = function() {
			// TODO
			if (DEBUG)
				print('pull.cancel')
		}

		return pull
	}

	// view -------------------------------------------------------------------

	e.group = new THREE.Group()
	e.group.model = e
	e.group.name = e.name

	if (DEBUG)
		window.g = e.group

	let canvas_w = 0
	let canvas_h = 0

	let resizing_meshes = []

	e.canvas_resized = function(w, h) {
		canvas_w = w
		canvas_h = h
		for (let mesh of resizing_meshes) {
			if (isarray(mesh.material)) {
				for (let mat of mesh.material) {
					let cu = mat.uniforms.canvas
					cu.value.x = canvas_w
					cu.value.y = canvas_h
				}
			} else {
				let cu = mesh.material.uniforms.canvas
				cu.value.x = canvas_w
				cu.value.y = canvas_h
			}
		}
	}

	// view --------------------------------------------------------------------

	let points_buf           // common point coordinates buffer for points, edges and smooth meshes.
	let normals_buf          // normal buffer for the normals of smooth meshes.
	let used_pis_buf         // index buffer for points.
	let vis_edge_lis_buf     // index buffer for face edges (black thin lines).
	let inv_edge_lis_buf     // index buffer for invisible face edges (black dashed lines).
	let sel_inv_edge_lis_buf // index buffer for selected invisible face edges (blue dashed lines).
	let inst_mat_buf         // instance matrices.

	function update_point(pi, x, y, z) {
		let pn = e.point_count()
		let b = points_buf
		if (b && b.count >= pn) {
			b.setXYZ(pi, x, y, z)
			// TODO: switch to ever-increasing range?
			b.updateRange.count = 3 * pn
			b.needsUpdate = true
		} else {
			points_changed = true
		}
	}

	function _update_points_buf(b, points, pn) {
		if (!b || b.count < pn) {
			b = point_buffer(nextpow2(pn))
		}
		b.array.set(points)
		b.updateRange.count = 3 * pn
		b.needsUpdate = true
		return b
	}

	function update_points_buf() {
		if (!points_changed)
			return
		points_buf = _update_points_buf(points_buf, points, e.point_count())
	}

	function update_normals_buf() {
		if (!normals_changed)
			return
		normals_buf = _update_points_buf(normals_buf, normals, e.point_count())
	}

	function update_used_pis_buf() {
		if (!used_points_changed)
			return

		let pn = e.point_count()
		let b = used_pis_buf
		if (!b || b.count < pn) {
			b = index_buffer(nextpow2(pn))
			used_pis_buf = b
		}

		let i = 0
		let is = b.array
		for (let pi = 0; pi < pn; pi++)
			if (prc[pi]) // is used
				is[i++] = pi

		b.updateRange.count = i
		b.needsUpdate = true
		b.used_count = i
	}

	e.show_invisible_lines = true

	e.toggle_invisible_lines = function() {
		e.show_invisible_lines = !e.show_invisible_lines
		used_lines_changed = true
	}

	function update_edge_lis_bufs() {
		if (!used_lines_changed)
			return

		let vln = edge_line_count
		let iln = e.show_invisible_lines ? vln : 0

		let vb = vis_edge_lis_buf
		let ib = inv_edge_lis_buf

		if (!vb || vb.count < vln) {
			vb = index_buffer(nextpow2(2 * vln))
			vis_edge_lis_buf = vb
		}

		if ((ib ? ib.count : 0) < iln) {
			ib = index_buffer(nextpow2(2 * iln))
			inv_edge_lis_buf = ib
		}

		let vi = 0
		let ii = 0
		let vs = vb.array
		let is = iln && ib && ib.array
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

		vb.updateRange.count = vi
		vb.needsUpdate = true
		vb.used_count = vi

		if (ib) {
			ib.updateRange.count = ii
			ib.needsUpdate = true
			ib.used_count = ii
		}
	}

	function update_sel_inv_edge_lis_buf() {

		let ln = e.show_invisible_lines ? e.sel_lines.size : 0
		let b = sel_inv_edge_lis_buf
		if ((b ? b.count : 0) < ln) {
			b = index_buffer(nextpow2(ln))
			sel_inv_edge_lis_buf = b
		}

		if (b) {
			let i = 0
			let is = b.array
			for (let li in e.sel_lines) {
				if (lines[5*li+4] == 0) { // opacity: is invisible.
					let p1i = lines[5*li+0]
					let p2i = lines[5*li+1]
					is[i++] = p1i
					is[i++] = p2i
				}
			}

			b.updateRange.count = i
			b.needsUpdate = true
			b.used_count = i
		}

	}

	function update_inst_mat_buf() {
		if (!inst_mat_changed)
			return
		let b = inst_mat_buf
		let n = e.instance_count()
		if (!b || b.count / 4 < n) {
			b = mat4_instance_buffer(nextpow2(n))
			inst_mat_buf = b
		}
		b.array.set(inst_mat)
		b.updateRange = 16 * n
		print(b)
		b.needsUpdate = true
	}

	function points_mesh() {

		let geo = new THREE.InstancedBufferGeometry()
		let mat = new THREE.PointsMaterial({
			color: black,
			size: 4,
			sizeAttenuation: false,
		})
		let mesh = new THREE.Points(geo, mat)
		mesh.name = 'points'
		mesh.frustumCulled = false
		mesh.layers.set(1) // make it non-hit-testable.

		e.group.add(mesh)

		let dots

		function update() {

			geo.setAttribute('position', points_buf)
			geo.setIndex(used_pis_buf)

			geo.setAttribute('instance_matrix', inst_mat_buf)
			geo.instanceCount = e.instance_count()

			if (DEBUG) {
				if (dots)
					for (dot of dots)
						dot.free()
				dots = []
				for (let pi of used_pis_buf.array) {
					let p = e.get_point(pi)
					let dot = e.editor.dot(p.clone(), pi, 'point')
					dots.push(dot)
				}
			}
		}

		return update
	}

	let update_points_mesh = points_mesh()

	function thin_lines_mesh(name, get_lis_buf, mat) {

		let geo, mesh, dots

		function update() {
			let b = get_lis_buf()
			if (!b)
				return

			if (!geo) {
				geo = new THREE.InstancedBufferGeometry()
				mesh = new THREE.LineSegments(geo, mat)
				mesh.name = name
				mesh.frustumCulled = false
				mesh.layers.set(1) // make it non-hit-testable.

				e.group.add(mesh)

				if (mat.uniforms && mat.uniforms.canvas)
					resizing_meshes.push(mesh)
			}

			geo.setAttribute('position', points_buf)
			geo.setIndex(b)

			geo.setDrawRange(0, b.used_count)

			geo.setAttribute('instance_matrix', inst_mat_buf)
			geo.instanceCount = e.instance_count()

			if (DEBUG) {
				if (dots)
					for (dot of dots)
						dot.free()
				dots = []
				for (let li of b.array) {
					let line = e.get_line(li)
					let dot = e.editor.dot(line.at(.5, v3()), line.i, 'line')
					dots.push(dot)
				}
			}
		}

		return update
	}

	let update_vis_edges_mesh = thin_lines_mesh(
		'vis_edges',
		() => vis_edge_lis_buf,
		new THREE.LineBasicMaterial({color: black}),
	)

	let update_inv_edges_mesh = thin_lines_mesh(
		'inv_edges',
		() => inv_edge_lis_buf,
		dashed_line_material({color: black, dash: 5, gap: 3}),
	)

	let update_sel_inv_edges_mesh = thin_lines_mesh(
		'sel_inv_edges',
		() => sel_inv_edge_lis_buf,
		dashed_line_material({color: selected_color, dash: 3, gap: 3}),
	)

	function fat_line_material(color) {

		let vshader = `
			uniform vec2 canvas;
			attribute mat4 instance_matrix;
			attribute vec3 q;
			attribute float dir;
			void main() {
				mat4 pvm = projectionMatrix * modelViewMatrix;

				// line points in NDC.
				vec4 dp = pvm * vec4(position, 1.0);
				vec4 dq = pvm * vec4(q, 1.0);
				dp /= dp.w;
				dq /= dq.w;

				// line normal in screen space.
				float dx = dq.x - dp.x;
				float dy = dq.y - dp.y;
				vec2 n = normalize(vec2(-dy, dx) * dir) / canvas * dp.w * 2.0;

				gl_Position = dp + vec4(n, 0.0, 0.0);
			}
		`

		let fshader = `
			uniform vec3 color;
			void main() {
				gl_FragColor = vec4(color, 1.0);
			}
		`

		let uniforms = {
			canvas : {type: 'v3', value: {x: canvas_w, y: canvas_h}},
			color  : {value: color3(color)},
		}

		let mat = new THREE.ShaderMaterial({
			uniforms       : uniforms,
			vertexShader   : vshader,
			fragmentShader : fshader,
			polygonOffset: true,
			polygonOffsetFactor: -1, // 1 pixel in front of lines.
			side: THREE.DoubleSide,
		})

		return mat

	}

	function fat_lines_mesh(name, should_update, get_max_count, each_li, color) {

		let geo = new THREE.InstancedBufferGeometry()
		let mat = fat_line_material(color)
		let mesh = new THREE.Mesh(geo, mat)
		mesh.frustumCulled = false
		mesh.name = name

		resizing_meshes.push(mesh)
		e.group.add(mesh)

		let capacity = 0
		let pb, qb, dirb, pib

		function update() {

			if (!should_update())
				return

			let max_count = get_max_count()

			if (capacity < max_count) {

				capacity = nextpow2(max_count)

				pb   = point_buffer(4 * capacity) // 4 points per line.
				qb   = point_buffer(4 * capacity) // 4 "other-line-endpoint" points per line.
				dirb =  int8_buffer(4 * capacity) // one direction sign per vertex.
				pib  = index_buffer(6 * capacity) // 1 quad = 2 triangles = 6 points per line.

				geo.setAttribute('position', pb)
				geo.setAttribute('q', qb)
				geo.setAttribute('dir', dirb)
				geo.setIndex(pib)

			}

			if (!pb)
				return

			let ps = pb.array
			let qs = qb.array
			let dirs = dirb.array
			let pis = pib.array

			let i = 0
			let j = 0
			each_li(function(li) {
				/*
				// simpler but slower (if not jit'ed) code for setting pb and qb:

				let line = e.get_line(li)
				let p1 = line.start
				let p2 = line.end

				pb.setXYZ(i+0, p1.x, p1.y, p1.z)
				pb.setXYZ(i+1, p1.x, p1.y, p1.z)
				pb.setXYZ(i+2, p2.x, p2.y, p2.z)
				pb.setXYZ(i+3, p2.x, p2.y, p2.z)

				qb.setXYZ(i+0, p2.x, p2.y, p2.z)
				qb.setXYZ(i+1, p2.x, p2.y, p2.z)
				qb.setXYZ(i+2, p1.x, p1.y, p1.z)
				qb.setXYZ(i+3, p1.x, p1.y, p1.z)
				*/

				let p1i = lines[5*li+0]
				let p2i = lines[5*li+1]

				let p1x = points[3*p1i+0]
				let p1y = points[3*p1i+1]
				let p1z = points[3*p1i+2]
				let p2x = points[3*p2i+0]
				let p2y = points[3*p2i+1]
				let p2z = points[3*p2i+2]

				// each line has 4 points: (p1, p1, p2, p2).
				ps[3*(i+0)+0] = p1x
				ps[3*(i+0)+1] = p1y
				ps[3*(i+0)+2] = p1z

				ps[3*(i+1)+0] = p1x
				ps[3*(i+1)+1] = p1y
				ps[3*(i+1)+2] = p1z

				ps[3*(i+2)+0] = p2x
				ps[3*(i+2)+1] = p2y
				ps[3*(i+2)+2] = p2z

				ps[3*(i+3)+0] = p2x
				ps[3*(i+3)+1] = p2y
				ps[3*(i+3)+2] = p2z

				// each point has access to its opposite point, so (p2, p2, p1, p1).
				qs[3*(i+0)+0] = p2x
				qs[3*(i+0)+1] = p2y
				qs[3*(i+0)+2] = p2z

				qs[3*(i+1)+0] = p2x
				qs[3*(i+1)+1] = p2y
				qs[3*(i+1)+2] = p2z

				qs[3*(i+2)+0] = p1x
				qs[3*(i+2)+1] = p1y
				qs[3*(i+2)+2] = p1z

				qs[3*(i+3)+0] = p1x
				qs[3*(i+3)+1] = p1y
				qs[3*(i+3)+2] = p1z

				// each point has an alternating normal direction.
				dirs[i+0] =  1
				dirs[i+1] = -1
				dirs[i+2] = -1
				dirs[i+3] =  1

				// each line is made of 2 triangles (0, 1, 2) and (1, 3, 2).
				pis[j+0] = i+0
				pis[j+1] = i+1
				pis[j+2] = i+2
				pis[j+3] = i+1
				pis[j+4] = i+3
				pis[j+5] = i+2

				i += 4
				j += 6
			})

			pb   .updateRange.count = 3 * i
			qb   .updateRange.count = 3 * i
			dirb .updateRange.count = i
			pib  .updateRange.count = j

			pb   .needsUpdate = true
			qb   .needsUpdate = true
			dirb .needsUpdate = true
			pib  .needsUpdate = true

			geo.setDrawRange(0, j)

			geo.setAttribute('instance_matrix', inst_mat_buf)
			geo.instanceCount = e.instance_count()
		}

		return update
	}

	function each_nonedge_line(f) {
		for (let i = 0, n = lines.length; i < n; i += 5)
			if (lines[i+2] == 1) // is standalone.
				f(li)
	}

	function each_sel_vis_line(f) {
		for (li of e.sel_lines)
			if (lines[5*li+4] > 0) // is visible.
				f(li)
	}

	let update_nonedge_lines_mesh = fat_lines_mesh(
		'fat_lines',
		() => points_changed || used_lines_changed,
		() => nonedge_line_count,
		each_nonedge_line,
		black
	)

	let update_sel_vis_lines_mesh = fat_lines_mesh(
		'sel_lines',
		() => points_changed || sel_lines_changed,
		() => e.sel_lines.size,
		each_sel_vis_line,
		selected_color
	)

	function face_mesh_material(opt) {

		let phong = THREE.ShaderLib.phong

		let uniforms = THREE.UniformsUtils.merge([phong.uniforms, {
			canvas: {type: 'v2', value: {x: canvas_w, y: canvas_h}},
		}])

		uniforms.diffuse.value.setHex(opt.color)

		let vshader = phong.vertexShader

		vshader = `
			attribute mat4 instance_matrix;
			attribute uint selected;
			flat out uint vselected;
		` + vshader

		vshader = vshader.replace(/}\s*$/, `
				vselected = selected;
			}
		`)

		vshader = vshader.replace('#include <begin_vertex>\n', `
			vec3 transformed = (instance_matrix + vec4(position, 1.0)).xyz;
		`)

		let fshader = THREE.ShaderChunk.meshphong_frag

		fshader = `
			flat in uint vselected;
		` + fshader

		fshader = fshader.replace(/}\s*$/, `
				if (vselected == uint(1)) {
					float x = mod(gl_FragCoord.x, 4.0);
					float y = mod(gl_FragCoord.y, 8.0);
					if ((x >= 0.0 && x <= 1.1 && y >= 0.0 && y <= 0.5) ||
						 (x >= 2.0 && x <= 3.1 && y >= 4.0 && y <= 4.5))
						gl_FragColor = vec4(0.0, 0.0, .8, 1.0);
				}
			}
		`)

		let mat = new THREE.ShaderMaterial({
			uniforms       : uniforms,
			vertexShader   : vshader,
			fragmentShader : fshader,
			polygonOffset: true,
			polygonOffsetFactor: 1, // 1 pixel behind lines.
			side: THREE.DoubleSide,
			lights: true,
		})

		if (DEBUG)
			print('add_material', '#'+uniforms.diffuse.value.getHexString())

		return mat
	}

	e.add_material({color: white})

	let convex_quad_triangle_indices = [2, 3, 0, 0, 1, 2]

	{
		let a = v3()
		let c = v3()
		let v = v3()
		let m = mat3()
		function cross_sign(_a, _b, _c) {
			a.subVectors(_a, _b)
			c.subVectors(_c, _b)
			v.crossVectors(a, c)
			// compute the signed volume between (ab, cb, ab x cb).
			// the sign tells you the direction of the cross vector.
			m.set(
				v.x, a.x, c.x,
				v.y, a.y, c.y,
				v.z, a.z, c.z
			)
			return sign(m.determinant())
		}
		let p0 = v3()
		let p1 = v3()
		let p2 = v3()
		let p3 = v3()
		function is_face_a_convex_quad(face) {
			e.get_point(face[0], p0)
			e.get_point(face[1], p1)
			e.get_point(face[2], p2)
			e.get_point(face[3], p3)
			let s0 = cross_sign(p0, p1, p2)
			let s1 = cross_sign(p1, p2, p3)
			let s2 = cross_sign(p2, p3, p0)
			let s3 = cross_sign(p3, p0, p1)
			let sr = abs(s0) >= NEARD ? s0 : s1 // one (and only one) of them can be zero.
			return (s0 == 0 || s0 == sr)
			    && (s1 == 0 || s1 == sr)
			    && (s2 == 0 || s2 == sr)
			    && (s3 == 0 || s3 == sr)
		}
	}

	function update_face_triangles(face) {
		if (!face.update_triangles) {
			let ps = []
			let triangles
			face.update_triangles = function() {
				if (face.triangles_valid)
					return
				let pn = face.length
				update_face_plane(face)
				if (!face.valid)
					return
				face.triangles.length = 0
				if (pn == 3) { // triangle: nothing to do, push points directly.
					face.triangles.push(...face)
				} else if (pn == 4 && is_face_a_convex_quad(face)) { // convex quad: most common case.
					for (let i of convex_quad_triangle_indices)
						face.triangles.push(face[i])
				} else {
					ps.length = pn * 2
					for (let i = 0; i < pn; i++) {
						let p = e.get_point(face[i])
						p.applyQuaternion(face.xy_quaternion) // project p to xy plane.
						ps[2*i+0] = p.x
						ps[2*i+1] = p.y
					}
					let pis = THREE.Earcut.triangulate(ps, null, 2)
					assert(pis.length == 3 * (pn - 2))
					for (let i = 0, tn = pis.length; i < tn; i++)
						face.triangles.push(face[pis[i]])
				}
				face.triangles_valid = true
			}
		}
		face.update_triangles()
	}

	function face_points_changed(face) {
		face.valid = false
		face.triangles_valid = false
	}

	// from https://www.iquilezles.org/www/articles/normals/normals.htm
	{
		let p1 = v3()
		let p2 = v3()
		let p3 = v3()
		function update_mesh_normals(mesh) {

			if (mesh.normals_valid)
				return

			for (let face of mesh) {
				if (face.valid) {
					let t = face.triangles
					for (let i = 0, len = t.length; i < len; i += 3) {

						let p1i = t[i+0]
						let p2i = t[i+1]
						let p3i = t[i+2]

						e.get_point(p3i, p3)
						e.get_point(p1i, p1).sub(p3)
						e.get_point(p2i, p2).sub(p3)
						let p = p1.cross(p2)

						normals[3*p1i+0] += p.x
						normals[3*p1i+1] += p.y
						normals[3*p1i+2] += p.z

						normals[3*p2i+0] += p.x
						normals[3*p2i+1] += p.y
						normals[3*p2i+2] += p.z

						normals[3*p3i+0] += p.x
						normals[3*p3i+1] += p.y
						normals[3*p3i+2] += p.z
					}
				}
			}

			mesh.normals_valid = true
			normals_changed = true
		}
	}

	function flat_faces_mesh() {

		let geo = new THREE.InstancedBufferGeometry()
		let mat = materials[0]
		let mesh = new THREE.Mesh(geo, materials)
		mesh.name = 'flat_faces'
		mesh.castShadow = false
		mesh.receiveShadow = false
		mesh.frustumCulled = false

		resizing_meshes.push(mesh)
		e.group.add(mesh)

		let pb, nb, sb

		function update() {

			let pn = 0
			for (let face of faces)
				if (face.valid && !face.mesh)
					pn += face.triangles.length

			if (!pb || pb.count < pn) {
				let capacity = nextpow2(pn)
				pb =  point_buffer(capacity)
				nb =  point_buffer(capacity)
				sb = uint32_buffer(capacity)
				geo.setAttribute('position', pb)
				geo.setAttribute('normal'  , nb)
				geo.setAttribute('selected', sb)
			}

			let offset = 0
			let mi = 0
			geo.clearGroups()

			for (let mat of materials) {
				let offset0 = offset
				let total = 0
				for (let face of mat.faces) {
					if (face.valid && !face.mesh) {
						let t = face.triangles
						let len = t.length
						for (let i = 0; i < len; i++) {
							let p = e.get_point(t[i])
							pb.array[3*(offset+i)+0] = p.x
							pb.array[3*(offset+i)+1] = p.y
							pb.array[3*(offset+i)+2] = p.z
						}
						let n = face.plane.normal
						for (let i = offset, j = offset + len; i < j; i++) {
							nb.array[3*i+0] = n.x
							nb.array[3*i+1] = n.y
							nb.array[3*i+2] = n.z
						}
						sb.array.fill(face.selected, offset, offset + len)
						offset += len
						total += len
					}
				}
				geo.addGroup(offset0, total, mi)
				mi++
			}

			pb.updateRange.count = 3 * pn
			nb.updateRange.count = 3 * pn
			sb.updateRange.count = pn

			pb.needsUpdate = true
			nb.needsUpdate = true
			sb.needsUpdate = true

			geo.setDrawRange(0, pn)

			geo.setAttribute('instance_matrix', inst_mat_buf)
			geo.instanceCount = e.instance_count()

			/*
			if (DEBUG) {
				if (face.normals_helper)
					e.group.remove(face.normals_helper)
				if (face.valid) {
					face.normals_helper = new THREE.VertexNormalsHelper(mesh, 2, 0x00ff00, 1)
					face.normals_helper.layers.set(1)
					e.group.add(face.normals_helper)
				}
			}

			if (DEBUG) {
				if (face.debug_dot)
					face.debug_dot.free()
				face.debug_dot = e.editor.dot(face_center(face), face.id+':'+face[0], 'face')
			}
			*/

		}

		return update
	}

	let update_flat_faces_mesh = flat_faces_mesh()

	function smooth_faces_mesh() {

		let geo = new THREE.InstancedBufferGeometry()
		let mat = materials[0]
		let mesh = new THREE.Mesh(geo, materials)
		mesh.name = 'smooth_faces'
		mesh.castShadow = false
		mesh.receiveShadow = false
		mesh.frustumCulled = false

		resizing_meshes.push(mesh)
		e.group.add(mesh)

		let ib, sb

		function update() {

			let pn = 0
			for (let face of faces)
				if (face.valid && face.mesh)
					pn += face.triangles.length

			geo.setAttribute('position', points_buf)
			geo.setAttribute('normal'  , normals_buf)

			if (!sb || sb.count < pn) {
				let capacity = nextpow2(pn)
				ib =  index_buffer(capacity)
				sb = uint32_buffer(capacity)
				geo.setIndex(ib)
				geo.setAttribute('selected', sb)
			}

			let offset = 0
			let mi = 0
			geo.clearGroups()

			for (let mat of materials) {
				let offset0 = offset
				let total = 0
				for (let face of mat.faces) {
					if (face.valid && face.mesh) {
						let len = face.triangles.length
						ib.array.set(face.triangles, offset, offset + len)
						sb.array.fill(face.selected, offset, offset + len)
						offset += len
						total += len
					}
				}
				geo.addGroup(offset0, total, mi)
				mi++
			}

			ib.updateRange.count = pn
			sb.updateRange.count = pn

			ib.needsUpdate = true
			sb.needsUpdate = true

			geo.setDrawRange(0, pn)

			geo.setAttribute('instance_matrix', inst_mat_buf)
			geo.instanceCount = e.instance_count()

			/*
			if (DEBUG) {
				if (face.normals_helper)
					e.group.remove(face.normals_helper)
				if (face.valid) {
					face.normals_helper = new THREE.VertexNormalsHelper(mesh, 2, 0x00ff00, 1)
					face.normals_helper.layers.set(1)
					e.group.add(face.normals_helper)
				}
			}

			if (DEBUG) {
				if (face.debug_dot)
					face.debug_dot.free()
				face.debug_dot = e.editor.dot(face_center(face), face.id+':'+face[0], 'face')
			}
			*/

		}

		return update
	}

	let update_smooth_faces_mesh = smooth_faces_mesh()

	e.update = function() {

		for (let face of faces)
			update_face_triangles(face)
		for (let mesh of meshes)
			update_mesh_normals(mesh)

		update_points_buf()
		update_normals_buf()
		update_used_pis_buf()
		update_edge_lis_bufs()
		update_inst_mat_buf()

		update_points_mesh()

		update_vis_edges_mesh()
		update_inv_edges_mesh()
		update_sel_inv_edges_mesh()
		update_nonedge_lines_mesh()
		update_sel_vis_lines_mesh()

		update_flat_faces_mesh()
		update_smooth_faces_mesh()

		inst_mat_changed = false
		points_changed = false
		normals_changed = false
		used_points_changed = false
		used_lines_changed = false
		sel_lines_changed = false

		if (DEBUG)
			print('update')
	}

	return e
}

// editor --------------------------------------------------------------------

component('x-modeleditor', function(e) {

	let pe = e

	// canvas, renderer, scene ------------------------------------------------

	e.canvas = tag('canvas')
	focusable_widget(e, e.canvas)
	e.canvas.attr('tabindex', -1)
	e.canvas.attr('style', 'position: absolute')
	e.add(e.canvas)

	e.context = assert(e.canvas.getContext('webgl2'))

	e.renderer = new THREE.WebGLRenderer({canvas: e.canvas, context: e.context, antialias: true})
	e.renderer.setPixelRatio(window.devicePixelRatio)
	e.renderer.outputEncoding = THREE.sRGBEncoding
	e.renderer.shadowMap.enabled = true

	if (DEBUG)
		window.renderer = e.renderer

	{
		let raf_id
		let do_render = function() {
			e.renderer.render(e.scene, e.camera)
			update_dot_positions()
			raf_id = null
		}
		function render() {
			if (!raf_id)
				raf_id = raf(do_render)
		}
	}

	e.scene = new THREE.Scene()

	function init() {

		e.scene.add(skydome())
		e.axes = axes()
		e.scene.add(e.axes)
		e.xyplane = xyplane(); e.scene.add(e.xyplane)
		e.zyplane = zyplane(); e.scene.add(e.zyplane)
		e.xzplane = xzplane(); e.scene.add(e.xzplane)
		e.ref_planes = [e.xyplane, e.zyplane, e.xzplane]
		e.scene.add(hemlight())
		e.dirlight = dirlight()
		e.scene.add(e.dirlight)

		// update state

		e.detect_resize()
		function resized(r) {
			e.camera.aspect = r.w / r.h
			e.camera.updateProjectionMatrix()
			e.renderer.setSize(r.w, r.h)
			e.model.canvas_resized(r.w, r.h)
			render()
		}
		e.on('resize', resized)

	}

	// camera -----------------------------------------------------------------

	e.min_distance = 0.001  // min line distance
	e.max_distance = 1e4    // max model total distance

	e.camera = new THREE.PerspectiveCamera(60, 1, e.min_distance * 100, e.max_distance * 100)
	e.camera.canvas = e.canvas // for v3.project_to_canvas()
	e.camera.layers.enable(1) // render objects that we don't hit test.
	e.camera.position.x = 2.3
	e.camera.position.y = 2.8
	e.camera.position.z = 3.7
	e.scene.add(e.camera)

	// screen-projected distances for hit testing -----------------------------

	e.snap_distance   = 20  // max pixel distance for snapping
	e.select_distance =  6  // max pixel distance for selecting

	e.hit_d = null // current hit distance, one of the above depending on tool.

	{
		let p = v3()
		let q = v3()
		function canvas_p2p_distance2(p1, p2) {
			p1.project_to_canvas(e.camera, p)
			p2.project_to_canvas(e.camera, q)
			return p.distanceToSquared(q)
		}
	}

	// hemlight ---------------------------------------------------------------

	function hemlight() {
		let e = new THREE.HemisphereLight(white, white, 0.6)
		e.color.setHSL(0.6, 1, 0.6)
		e.groundColor.setHSL(0.095, 1, 0.75)
		e.position.set(0, 0, 0)
		return e
	}

	// dirlight ---------------------------------------------------------------

	function dirlight() {
		let e = new THREE.DirectionalLight(white, 1)
		/*
		e.castShadow = true
		e.shadow.mapSize.width = 2048
		e.shadow.mapSize.height = 2048
		let d = 50
		e.shadow.camera.left = - d
		e.shadow.camera.right = d
		e.shadow.camera.top = d
		e.shadow.camera.bottom = - d
		e.shadow.camera.far = 3500
		e.shadow.bias = - 0.0001
		*/
		return e
	}

	// skydome ----------------------------------------------------------------

	function skydome() {

		let vshader = `
			varying vec3 vWorldPosition;
			void main() {
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPosition.xyz;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}

		`

		let fshader = `
			uniform vec3 sky_color;
			uniform vec3 horizon_color;
			uniform vec3 ground_color;
			uniform float offset;
			uniform float exponent;
			varying vec3 vWorldPosition;
			void main() {
				float h = normalize(vWorldPosition).y;
				gl_FragColor = vec4(
					mix(
						mix(horizon_color, sky_color, pow(max(h, 0.0), exponent)),
						ground_color,
						1.0-step(0.0, h)
				), 1.0);
			}
		`

		let uniforms = {
			sky_color     : {value: color3(sky_color)},
			horizon_color : {value: color3(horizon_color)},
			ground_color  : {value: color3(ground_color)},
			exponent      : {value: .5},
		}

		let d = 2 * pe.max_distance
		let geo = new THREE.BoxBufferGeometry(d, d, d)
		let mat = new THREE.ShaderMaterial({
			uniforms       : uniforms,
			vertexShader   : vshader,
			fragmentShader : fshader,
			side: THREE.BackSide,
		})

		let e = new THREE.Mesh(geo, mat)
		e.name = 'skydome'

		return e
	}

	// cursor -----------------------------------------------------------------

	{
		let cursor_x = {line:  0}
		let cursor_y = {line: 25}
		let cursor
		e.property('cursor', () => cursor, function(name) {
			cursor = name
			let x = cursor_x[name] || 0
			let y = cursor_y[name] || 0
			e.canvas.style.cursor = 'url(cursor_'+name+'.png) '+x+' '+y+', auto'
		})
	}

	// cursor tooltip ---------------------------------------------------------

	{

		let tooltip_text = ''

		let tooltip = div({style: `
			position: absolute;
			white-space: nowrap;
			user-select: none;
			margin-left: .5em;
			margin-top : .5em;
			padding: .25em .5em;
			border: 1px solid #aaaa99;
			color: #333;
			background-color: #ffffcc;
			font-family: sans-serif;
			font-size: 12px;
		`}, tooltip_text)

		tooltip.hide()
		e.add(tooltip)

		let show_tooltip_after = timer(function() {
			tooltip.show()
		})

		e.property('tooltip', () => tooltip_text, function(s) {
			tooltip.hide()
			if (s) {
				tooltip.set(s)
				tooltip.x = e.mouse.x
				tooltip.y = e.mouse.y
				show_tooltip_after(.2)
			} else {
				show_tooltip_after(false)
			}
		})
	}

	// helper lines -----------------------------------------------------------

	e.line = function(name, line, dotted, color) {

		color = color || 0

		let e, mat

		if (dotted) {

			mat = dashed_line_material({color: color})

			function resized(r) {
				mat.uniforms.canvas.value.x = r.w
				mat.uniforms.canvas.value.y = r.h
			}

			pe.on('resize', resized)

			mat.set_color = function(color) {
				this.uniforms.color.value.set(color)
			}

			mat.set_color(color)

			mat.free = function() {
				pe.off('resize', resized)
			}

		} else {

			mat = new THREE.LineBasicMaterial({color: color})

			mat.set_color = function(color) {
				this.color.set(color)
			}

			mat.free = noop

		}

		let geo = new THREE.BufferGeometry().setFromPoints([line.start, line.end])

		e = new THREE.LineSegments(geo, mat)
		e.line = line
		e.name = name

		property(e, 'color', () => color, function(color1) {
			color = color1
			mat.set_color(color)
		})

		e.free = function() {
			mat.free()
			pe.scene.remove(e)
			geo.dispose()
			mat.dispose()
		}

		e.update = function() {
			let pb = geo.attributes.position
			let p1 = e.line.start
			let p2 = e.line.end
			pb.setXYZ(0, p1.x, p1.y, p1.z)
			pb.setXYZ(1, p2.x, p2.y, p2.z)
			pb.needsUpdate = true
		}

		e.update_endpoints = function(p1, p2) {
			e.line.start.copy(p1)
			e.line.end.copy(p2)
			e.update()
			e.visible = true
		}

		pe.scene.add(e)

		return e

	}

	// helper dots ------------------------------------------------------------

	e.dot = function(point, text, text_class) {

		let s = 'model-editor-dot'
		let e = div({class: (text != null ? s+'-debug '+s+'-debug-'+text_class : s)})
		if (text != null)
			e.set(text)

		e.point = point || v3()

		let p = v3()
		e.update = function() {
			p.copy(e.point).project(pe.camera)
			let x = round(( p.x + 1) * pe.canvas.width  / 2)
			let y = round((-p.y + 1) * pe.canvas.height / 2)
			e.x = x
			e.y = y
			e.attr('snap', e.point.snap)
		}

		e.update_point = function(p) {
			let snap = e.point.snap
			assign(e.point, p)
			e.point.snap = snap
			e.visible = true
			e.update()
		}

		property(e, 'visible',
			function()  { return !e.hasattr('hidden') },
			function(v) { e.show(!!v) }
		)

		e.free = function() {
			e.remove()
		}

		e.update()
		pe.add(e)

		return e
	}

	function update_dot_positions() {
		for (let ce of e.at)
			if (ce.update)
				ce.update()
	}

	// helper vectors ---------------------------------------------------------

	let helpers = {}

	e.v3d = function(id, vector, origin) {
		let e = helpers[id]
		if (!e) {
			e = new THREE.Group()
			e.line = pe.line(id, line3())
			let geo = new THREE.ConeGeometry(.01, .04)
			geo.translate(0, -.04 / 2, 0)
			geo.rotateX(PI / 2)
			let mat = new THREE.MeshPhongMaterial({color: 0x333333})
			e.cone = new THREE.Mesh(geo, mat)
			e.add(e.line)
			e.add(e.cone)
			e.origin = v3()
			e.vector = v3()
			e.update = function() {
				let len = e.vector.length()
				e.line.line.end.z = len
				e.cone.position.z = len
				e.line.update()
				let p = e.position.clone()
				e.position.copy(v3())
				e.lookAt(e.vector)
				e.position.copy(p)
			}
			helpers[id] = e
			pe.scene.add(e)
		}
		if (vector)
			e.vector.copy(vector)
		if (origin)
			e.position.copy(origin)
		e.update()
	}

	// axes -------------------------------------------------------------------

	function axis(name, p, color, dotted) {
		return e.line(name, line3(v3(), p.setLength(e.max_distance)), dotted, color)
	}

	function axes() {
		let e = new THREE.Group()
		let axes = [
			axis('+z_axis', v3( 0,  0, -1), z_axis_color),
			axis('+x_axis', v3( 1,  0,  0), x_axis_color),
			axis('+y_axis', v3( 0,  1,  0), y_axis_color),
			axis('-z_axis', v3( 0,  0,  1), z_axis_color, true),
			axis('-x_axis', v3(-1,  0,  0), x_axis_color, true),
			axis('-y_axis', v3( 0, -1,  0), y_axis_color, true),
		]
		e.add(...axes)
		return e
	}

	// reference planes -------------------------------------------------------

	// intersect infinite line (p1, p2) with its perpendicular from point p.
	function point2_hit_line2(p, p1, p2, int_p) {
		let dx = p2.x - p1.x
		let dy = p2.y - p1.y
		let k = dx ** 2 + dy ** 2
		if (k == 0)
			return false // line has no length
		k = ((p.x - p1.x) * dy - (p.y - p1.y) * dx) / k
		int_p.x = p.x - k * dy
		int_p.y = p.y + k * dx
		return true
	}

	function ref_plane(
			name, normal, plane_hit_tooltip,
			main_axis_snap, main_axis, main_axis_snap_tooltip
	) {
		let d = 2 * pe.max_distance
		let geo = new THREE.PlaneBufferGeometry(d)
		let mat = new THREE.MeshBasicMaterial({
			depthTest: false,
			visible: false,
			side: THREE.DoubleSide,
		})
		let e = new THREE.Mesh(geo, mat)
		e.name = name

		let hits = []
		e.mouse_hit_plane = function(plane_position) {
			e.position.copy(plane_position)
			hits.length = 0
			let h = pe.raycaster.intersectObject(e, false, hits)[0]
			if (!h)
				return
			let p = h.point
			let plane_dir = pe.raycaster.ray.origin.clone().projectOnPlane(v3(0, 1, 0))
			let angle = plane_dir.angleTo(normal)
			if (angle > PI / 2)
				angle = abs(angle - PI)
			p.angle = angle
			p.tooltip = plane_hit_tooltip
			return p
		}

		{
			let _p1 = v3()
			let _p2 = v3()
			let _line1 = line3(_p1, _p2)
			let _p3 = v3()
			let _p4 = v3()
			let _line2 = line3(_p3, _p4)
			let _line3 = line3()

			e.mouse_hit_main_axis = function(axis_position, int_p) {

				int_p.ds = 1/0
				int_p.line_snap = null
				int_p.tooltip = null

				let p1 = axis_position.project_to_canvas(pe.camera, _p1)
				let p2 = _p2.copy(axis_position).add(main_axis).project_to_canvas(pe.camera, _p2)
				let hit = point2_hit_line2(pe.mouse, p1, p2, int_p)
				if (!hit)
					return
				let ds = _p1.set(pe.mouse.x, pe.mouse.y, 0).distanceToSquared(int_p)
				if (ds > pe.hit_d ** 2)
					return

				// get hit point in 3D space by raycasting to int_p.

				update_raycaster(int_p)
				_line1.copy(pe.mouse_ray)
				update_raycaster(pe.mouse)

				_p3.copy(axis_position)
				_p4.copy(axis_position).add(main_axis)

				let int_line = _line1.intersectLine(_line2, false, _line3)
				if (!int_line)
					return

				int_p.copy(int_line.end)
				int_p.ds = ds
				int_p.line_snap = main_axis_snap
				int_p.tooltip = main_axis_snap_tooltip

			}
		}

		let _p = v3()
		e.point_along_main_axis = function(p, axis_position) {
			if (_p.copy(p).sub(axis_position).cross(main_axis).lengthSq() < NEARD ** 2) {
				p.line_snap = main_axis_snap
				return true
			}
		}

		// intersect the plane's main axis from an origin with a line
		// and return the projected point on the line.
		let int_line = line3()
		let main_axis_line = line3()
		e.main_axis_hit_line = function(axis_position, line, int_p) {
			main_axis_line.start.copy(axis_position)
			main_axis_line.end.copy(axis_position).add(main_axis)
			if (!main_axis_line.intersectLine(line, false, int_line))
				return
			let ds = int_line.start.distanceToSquared(int_line.end)
			if (ds > NEARD ** 2)
				return
			int_p.copy(int_line.end)
			int_p.line_snap = main_axis_snap
			return true
		}

		return e
	}

	function xyplane() {
		return ref_plane(
			'xyplane', v3(0, 0, 1), 'on the blue-red vertical plane',
			'y_axis', v3(0, 1, 0), 'on blue axis')
	}

	function zyplane() {
		let e = ref_plane(
			'zyplane', v3(1, 0, 0), 'on the blue-green vertical plane',
			'z_axis', v3(0, 0, 1), 'on green axis')
		e.rotation.y = -PI / 2
		return e
	}

	function xzplane() {
		let e = ref_plane(
			'xzplane', v3(0, 1, 0), 'on the horizontal plane',
			'x_axis', v3(1, 0, 0), 'on red axis')
		e.rotation.x = -PI / 2
		return e
	}

	function mouse_hit_ref_planes(plane_position) {
		// hit horizontal plane first.
		let p = e.xzplane.mouse_hit_plane(plane_position)
		if (p)
			return p
		// hit vertical ref planes.
		let p1 = e.xyplane.mouse_hit_plane(plane_position)
		let p2 = e.zyplane.mouse_hit_plane(plane_position)
		// pick whichever plane is facing the camera more straightly.
		return (p1 ? p1.angle : 1/0) < (p2 ? p2.angle : 1/0) ? p1 : p2
	}

	{
		let ps = [v3(), v3(), v3()]
		let cmp_ps = function(p1, p2) {
			return p1.ds == p2.ds ? 0 : (p1.ds < p2.ds ? -1 : 1)
		}
		function mouse_hit_axes(axis_position) {
			let i = 0
			for (let plane of e.ref_planes)
				plane.mouse_hit_main_axis(axis_position, ps[i++])
			ps.sort(cmp_ps)
			return ps[0].line_snap ? ps[0] : null
		}

	}

	// given `p` on `line`, get the axis-intersects-line point that is closest to `p`.
	{
		let int_p = v3()
		let ret = v3()
		function axes_hit_line(axes_origin, p, line) {
			let min_ds = 1/0
			let min_int_p
			for (let plane of e.ref_planes) {
				if (plane.main_axis_hit_line(axes_origin, line, int_p)) {
					let ds = sqrt(canvas_p2p_distance2(p, int_p))
					if (ds <= e.hit_d ** 2 && ds <= min_ds) {
						min_ds = ds
						min_int_p = assign(min_int_p || v3(), int_p)
					}
				}
			}
			return min_int_p
		}
	}

	function check_point_on_axes(p, axes_origin) {
		for (let plane of e.ref_planes)
			if (plane.point_along_main_axis(p, axes_origin))
				return true
	}

	// model ------------------------------------------------------------------

	e.components = {} // {name->group}
	e.model = editable_model({})
	e.model.editor = e
	e.scene.add(e.model.group)

	// direct-manipulation tools ==============================================

	let tools = {}

	// orbit tool -------------------------------------------------------------

	tools.orbit = {}

	function update_controls() {
		e.controls.update()
		e.camera.updateProjectionMatrix()
		e.camera.getWorldDirection(e.dirlight.position)
		e.dirlight.position.negate()
	}

	tools.orbit.bind = function(on) {
		if (on && !e.controls) {
			e.controls = new THREE.OrbitControls(e.camera, e.canvas)
			e.controls.minDistance = e.min_distance * 10
			e.controls.maxDistance = e.max_distance / 100
		}
		e.controls.enabled = on
		update_controls()
	}

	tools.orbit.pointermove = function() {
		if (!e.mouse.left)
			return
		update_controls()
		return true
	}

	// current point hit-testing and snapping ---------------------------------

	function mouse_hit_faces() {
		let hit = e.raycaster.intersectObject(e.model.group, true)[0]
		if (!(hit && hit.object.type == 'Mesh'))
			return
		// print(hit.object.name == 'smooth_faces')
		// print(hit.faceIndex)

		hit.point.face = hit.object.face
		hit.point.snap = 'face'
		return hit.point
	}

	function mouse_hit_model(axes_origin, hit_void) {

		let p = mouse_hit_faces()

		if (p) {

			// we've hit a face, but we still have to hit any lines
			// that lie in front of it, on it, or intersecting it.

			let p0 = e.raycaster.ray.origin
			let ray = line3(p0, e.raycaster.ray.direction.clone().setLength(2 * e.max_distance).add(p0))
			let plane = e.model.face_plane(p.face)

			// preliminary line filter before hit-testing.
			// this can filter a lot or very little depending on context.
			// also marks the lines that are intersecting the plane for a later check.
			function is_line_not_behind_face_plane(line) {
				let d1 = plane.distanceToPoint(line.start)
				let d2 = plane.distanceToPoint(line.end)
				let intersects =
				      (d2 < -NEARD && d1 > NEARD && 1)
					|| (d1 < -NEARD && d2 > NEARD && 2)
				line.intersects_face_plane = intersects
				return intersects || (d1 >= -NEARD && d2 >= -NEARD)
			}

			// complete (but more expensive) line filter applied after hit-testing.
			// filters out lines that are marked as intersecting the face plane
			// but are not intersecting the face mesh itself.
			function is_intersecting_line_valid(int_p, line) {
				if (line.intersects_face_plane)
					if (!e.model.line_intersects_face(line, p.face, line.intersects_face_plane == 1)) {
						return false
					}
			}

			let p1 = e.model.line_hit_lines(ray, e.hit_d, canvas_p2p_distance2, true,
				is_intersecting_line_valid, null, is_line_not_behind_face_plane)

			if (p1) {

				// we've hit a line. snap to it.
				let line = e.model.get_line(p1.li)

				// check if the hit line intersects the hit plane: that's a snap point.
				let plane_int_p = e.model.line_intersect_face_plane(line, p.face)

				// check if the hit line intersects any axes originating at line start: that's a snap point.
				let axes_int_p = axes_origin && axes_hit_line(axes_origin, p1, line)

				// snap the hit point along the hit line along with any additional snap points.
				e.model.snap_point_on_line(p1, line, e.hit_d, canvas_p2p_distance2, plane_int_p, axes_int_p)
				if (axes_origin)
					check_point_on_axes(p1, axes_origin)

				// if the snapped point is not behind the plane, use it, otherwise forget that we even hit the line.
				if (plane.distanceToPoint(p1) >= -NEARD)
					assign(p, p1) // merge snap data.

			} else {

				// free moving on the face face.


			}

		} else {

			// we haven't hit a face: hit the line closest to the ray regardless of depth.
			let p0 = e.raycaster.ray.origin
			let p1 = e.raycaster.ray.direction
			let ray = line3(p0, p1.clone().setLength(2 * e.max_distance).add(p0))
			p = e.model.line_hit_lines(ray, e.hit_d, canvas_p2p_distance2, true)

			if (p) {

				// we've hit a line. snap to it.
				let line = e.model.get_line(p.li)

				// check if the hit line intersects any axes originating at line start: that's a snap point.
				let axes_int_p = axes_origin && axes_hit_line(axes_origin, p, line)

				// snap the hit point along the hit line along with any additional snap points.
				e.model.snap_point_on_line(p, line, e.hit_d, canvas_p2p_distance2, null, axes_int_p)
				if (axes_origin)
					check_point_on_axes(p, axes_origin)

			} else if (hit_void) {

				// we've hit squat: hit the axes and the ref planes.
				p = axes_origin && mouse_hit_axes(axes_origin)
					|| mouse_hit_ref_planes(axes_origin || v3())

			}

		}

		return p
	}

	// line tool --------------------------------------------------------------

	tools.line = {}

	tools.line.bind = function(on) {
		if (on) {
			let endp = v3()
			e.cur_point = e.dot(endp)
			e.cur_point.visible = false

			e.cur_line = e.line('cur_line', line3(v3(), endp))
			e.cur_line.color = black
			e.cur_line.visible = false

			e.ref_point = e.dot()
			e.ref_point.point.snap = 'ref_point'
			e.ref_point.visible = false

			e.ref_line = e.line('ref_line', line3(), true)
			e.ref_line.visible = false
		} else {
			e.cur_point = e.cur_point.free()
			e.cur_line  = e.cur_line.free()
			e.ref_point = e.ref_point.free()
			e.ref_line  = e.ref_line.free()
		}
	}

	tools.line.cancel = function() {
		e.tooltip = ''
		e.cur_line.visible = false
		e.ref_point.visible = false
		e.ref_line.visible = false
	}

	let snap_tooltips = {
		// for current point
		point: 'at point',
		line: 'on edge',
		line_middle: 'at midpoint',
		line_plane_intersection: 'on line-plane intersection',
		face: 'on face',
		// for current line
		line_point_intersection: 'on line touching point',
	}

	let line_snap_colors = {
		y_axis: y_axis_color,
		x_axis: x_axis_color,
		z_axis: z_axis_color,
		line_point_intersection: ref_color,
	}

	let future_ref_point = v3()
	let ref_point_update_after = timer(function() {
		e.ref_point.update_point(future_ref_point)
	})

	tools.line.pointermove = function() {

		let cline = e.cur_line.line
		let p1 = cline.start
		let p2 = cline.end
		p2.i = null
		p2.face = null
		p2.li = null
		p2.snap = null
		p2.line_snap = null
		p2.tooltip = null

		e.ref_line.snap = null
		e.ref_line.visible = false

		ref_point_update_after(false)

		e.hit_d = e.snap_distance
		let p = mouse_hit_model(e.cur_line.visible ? p1 : null, true)

		if (p) {

			// change the ref point.
			if ((p.snap == 'point' || p.snap == 'line_middle')
				&& (p.i == null || !e.cur_line.visible || p.i != cline.start.i)
			) {
				assign(future_ref_point, p)
				ref_point_update_after(.5)
			}

			if (!e.cur_line.visible) { // moving the start point

				if (!p.snap) { // free-moving point.

					// snap point to axes originating at the ref point.
					if (e.ref_point.visible) {
						let axes_int_p = mouse_hit_axes(e.ref_point.point)
						if (axes_int_p) {
							p = axes_int_p
							e.ref_line.snap = p.line_snap
							e.ref_line.update_endpoints(e.ref_point.point, p)
						}
					}

				}

				assign(p1, p)
				assign(p2, p)

			} else { // moving the line end-point.

				if (!p.snap) { // (semi-)free-moving point.

					// NOTE: p.line_snap makes the hit point lose one degree of freedom,
					// so there's still one degree of freedom to lose to point-snapping.

					// snap point to axes originating at the ref point.
					if (e.ref_point.visible) {
						assign(p2, p)
						let p_line_snap = p.line_snap
						let axes_int_p = axes_hit_line(e.ref_point.point, p, cline)
						if (axes_int_p && canvas_p2p_distance2(axes_int_p, p) <= e.hit_d ** 2) {
							assign(p, axes_int_p)
							e.ref_line.snap = axes_int_p.line_snap
							p.line_snap = p_line_snap
							e.ref_line.update_endpoints(e.ref_point.point, p)
						}

					}

					// TODO: check again if the snapped point hits the model.

				}

				assign(p2, p)

			}

		}

		p = p2

		e.cur_point.visible = !!p.snap
		e.tooltip = snap_tooltips[p.snap || p.line_snap] || p.tooltip
		e.cur_point.snap = p2.snap
		e.cur_line.color = or(line_snap_colors[p2.line_snap], black)
		e.ref_line.color = or(line_snap_colors[e.ref_line.snap], black)

		e.cur_point.update()
		e.cur_line.update()
		e.ref_line.update()

		return true
	}

	tools.line.pointerdown = function() {
		e.tooltip = ''
		let cline = e.cur_line.line
		if (e.cur_line.visible) {
			let closing = cline.end.i != null || cline.end.li != null
			e.model.draw_line(cline)
			e.model.update()
			e.ref_point.visible = false
			if (closing) {
				tools.line.cancel()
			} else {
				cline.start.copy(cline.end)
				cline.start.i = cline.end.i
			}
		} else {
			if (cline.start.i != null && e.ref_point.point.i == cline.start.i)
				e.ref_point.visible = false
			e.cur_line.visible = true
		}
	}

	// rectangle tool ---------------------------------------------------------

	tools.rect = {}

	tools.rect.pointerdown = function() {

	}

	// push/pull tool ---------------------------------------------------------

	tools.pull = {}

	{
		let hit_p // point on the plane hit for pulling.
		let pull  // pull state for live pulling.

		tools.pull.bind = function(on) {
			if (!on)
				tools.pull.cancel()
		}

		tools.pull.pointermove = function() {
			if (pull) {
				move()
				return true
			} else {
				let p = mouse_hit_faces()
				if (p && p.snap == 'face') {
					e.model.select_face(p.face)
					e.model.update()
				} else {
					p = null
					e.model.select_all(false)
					e.model.update()
				}
				let hit_face_changed = (hit_p && hit_p.face) !== (p && p.face)
				hit_p = p
				return hit_face_changed
			}
		}

		let _line = line3()

		function move() {
			if (!pull)
				start()
			let p = mouse_hit_model()
			if (!p || !pull.can_hit(p)) {
				let int_line = e.mouse_ray.intersectLine(pull.dir, false, _line)
				if (int_line)
					p = int_line.start

			}
			if (p)
				pull.pull(p)
		}

		function start() {
			pull = e.model.start_pull(hit_p)
			e.model.update()
		}

		function stop() {
			pull.stop()
			pull = null
			e.model.select_all(false)
			e.model.update()
		}

		tools.pull.pointerdown = function(capture) {
			if (pull) {
				stop()
			} else if (hit_p != null) {
				return capture(move, function() {
					if (pull)
						stop()
					else
						start()
				})
			}
		}

		tools.pull.cancel = function() {
			if (pull) {
				pull.cancel()
				pull = null
			}
		}

	}

	// select tool ------------------------------------------------------------

	tools.select = {}

	{

		let mode
		let p

		let update_mode = function() {
			mode = e.shift && e.ctrl && 'remove'
				|| e.shift && 'toggle' || e.ctrl && 'add' || null
			e.cursor = 'select' + (mode && '_' + mode || '')
			if (mode == 'remove') mode = false
			if (mode == 'add') mode = true
		}

		tools.select.keydown = function() {
			update_mode()
		}

		tools.select.keyup = function() {
			update_mode()
		}

		tools.select.click = function(nclicks) {
			if (nclicks > 3)
				return
			e.hit_d = e.select_distance
			p = mouse_hit_model()
			if (!p && nclicks == 1 && !mode) {
				e.model.select_all(false)
				e.model.update()
			} else if (p && nclicks == 3) {
				e.model.select_all(true)
				e.model.update()
			} else if (p && nclicks <= 2) {
				if (p.li != null) {
					e.model.select_line(p.li, mode, nclicks == 2)
					e.model.update()
				} else if (p.face != null) {
					e.model.select_face(p.face, mode, nclicks == 2)
					e.model.update()
				}
			}
		}

	}

	// move tool --------------------------------------------------------------

	tools.move = {}

	// current tool -----------------------------------------------------------

	let tool
	{
		let toolname
		e.property('tool', () => toolname, function(name) {
			e.tooltip = ''
			if (tool && tool.bind)
				tool.bind(false)
			tool = assert(tools[name])
			toolname = name
			e.cursor = tool.cursor || name
			if (tool.bind) {
				tool.bind(true)
				fire_pointermove(true)
			}
		})
	}

	// mouse handling ---------------------------------------------------------

	e.mouse = v2()
	e.mouse_ray = line3()
	e.raycaster = new THREE.Raycaster()

	{
		let _p = v2()
		function update_raycaster(p) {
			_p.x =  (p.x / e.canvas.width ) * 2 - 1
			_p.y = -(p.y / e.canvas.height) * 2 + 1
			e.raycaster.setFromCamera(_p, e.camera)
			e.mouse_ray.start.copy(e.raycaster.ray.origin)
			e.mouse_ray.end.copy(e.raycaster.ray.origin).add(e.raycaster.ray.direction)
		}

		function update_mouse(ev, mx, my, left_down) {
			e.mouse.x = mx
			e.mouse.y = my
			if (left_down != null)
				e.mouse.left = left_down
			update_keys(ev)
			update_raycaster(e.mouse)
		}
	}

	function update_keys(ev) {
		e.shift = ev.shiftKey
		e.ctrl  = ev.ctrlKey
		e.alt   = ev.altKey
	}

	function fire_pointermove(do_render) {
		if (tool.pointermove)
			do_render = or(tool.pointermove(), do_render)
		if (do_render)
			render()
	}

	e.on('pointermove', function(ev, mx, my) {
		update_mouse(ev, mx, my)
		fire_pointermove()
	})

	e.on('pointerdown', function(ev, mx, my) {
		update_mouse(ev, mx, my, true)
		if (tool.pointerdown) {
			fire_pointermove(false)
			function capture(move, up) {
				let movewrap = move && function(ev, mx, my) {
					update_mouse(ev, mx, my)
					return move()
				}
				let upwrap = up && function(ev, mx, my) {
					update_mouse(ev, mx, my, false)
					return up()
				}
				return e.capture_pointer(ev, movewrap, upwrap)
			}
			tool.pointerdown(capture)
			fire_pointermove(true)
		} else {
			fire_pointermove()
		}
	})

	e.on('pointerup', function(ev, mx, my) {
		update_mouse(ev, mx, my, false)
		fire_pointermove()
	})

	e.on('pointerleave', function(ev) {
		e.tooltip = ''
	})

	e.on('click', function(ev, nclicks, mx, my) {
		update_mouse(ev, mx, my)
		if (tool.click) {
			tool.click(nclicks)
			fire_pointermove(true)
		} else {
			fire_pointermove()
		}
	})

	e.canvas.on('wheel', function(ev, delta, mx, my) {
		update_mouse(ev, mx, my)
		e.controls.enableZoom = false
		let factor = 1
		let ndc_mx =  (mx / e.canvas.width ) * 2 - 1
		let ndc_my = -(my / e.canvas.height) * 2 + 1
		let v = v3(ndc_mx, ndc_my, 0.5)
		v.unproject(e.camera)
		v.sub(e.camera.position)
		v.setLength(factor)
		if (delta < 0) {
			e.camera.position.add(v)
			e.controls.target.add(v)
		} else {
			e.camera.position.sub(v)
			e.controls.target.sub(v)
		}
		e.controls.update()
		e.camera.updateProjectionMatrix()
		e.camera.getWorldDirection(e.dirlight.position)
		e.dirlight.position.negate()
		fire_pointermove(true)
		return false
	})

	// key handling -----------------------------------------------------------

	let tool_keys = {
		l: 'line',
		r: 'rect',
		p: 'pull',
		o: 'orbit',
		m: 'move',
	}

	e.on('keydown', function(key, shift, ctrl, alt, ev) {
		update_keys(ev)
		if (key == 'Delete') {
			e.model.remove_selection()
			e.model.update()
			render()
		} else if (key == 'h') {
			e.model.toggle_invisible_lines()
			e.model.update()
			render()
		}
		if (tool.keydown)
			if (tool.keydown(key) === false)
				return false
		if (key == 'Escape')
			if (tool.cancel)
				tool.cancel()
		if (shift || ctrl)
			return
		let toolname = tool_keys[key.toLowerCase()]
		if (toolname) {
			e.tool = toolname
			return false
		} else if (key == ' ') {
			e.tool = e.tool == 'select' ? 'orbit' : 'select'
			return false
		}
	})

	e.on('keyup', function(key, shift, ctrl, alt, ev) {
		update_keys(ev)
		if (tool.keydown)
			if (tool.keydown(key) === false)
				return false
	})

	// test cube --------------------------------------------------------------


	function draw_test_cube() {

		let mat1 = e.model.add_material({color: 0xff9900})
		let mat2 = e.model.add_material({color: 0x0099ff})

		let m = {
			points: [
				 0,  0, -1,
				 2,  0, -1,
				 2,  2,  0,
				 0,  2,  0,
				 0,  0,  2,
				 2,  0,  2,
				 2,  2,  2,
				 0,  2,  2,
			],
			faces: [
				[1, 0, 3, 2],
				[4, 5, 6, 7],
				[7, 6, 2, 3], //[6, 2, 3],
				[4, 0, 1, 5],
				[0, 4, 7, 3],
				[5, 1, 2, 6],
			],
		}

		m.faces[0].material = mat1
		m.faces[1].material = mat1
		m.faces[2].material = mat2

		e.model.set(m)

		e.model.set_line_smoothness(0, 1)
		e.model.set_line_smoothness(2, 1)
		e.model.set_line_opacity(0, 0)
		e.model.set_line_opacity(2, 0)

		//e.model.group.position.y = 1

		e.model.add_instance(mat4())
		e.model.add_instance(mat4())

		e.model.update()

	}

	// init -------------------------------------------------------------------

	init()
	draw_test_cube()
	e.tool = 'orbit'

})

})()
