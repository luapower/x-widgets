/*

	3D model editor widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

DEBUG = 1

// colors --------------------------------------------------------------------

let white = 0xffffff
let black = 0x000000
let selected_color = 0x0000ff
let ref_color = 0xff00ff

component('x-modeleditor', function(e) {

	let pe = e

	// canvas & webgl context -------------------------------------------------

	e.canvas = tag('canvas')
	focusable_widget(e, e.canvas)
	e.canvas.attr('tabindex', -1)
	e.canvas.attr('style', 'position: absolute')
	e.add(e.canvas)

	let gl = assert(e.canvas.getContext('webgl2'))
	e.gl = gl

	// props ------------------------------------------------------------------

	let skybox = gl.skybox()
	let axes = gl.axes()
	axes.add_instance()

	// camera -----------------------------------------------------------------

	e.camera = camera()

	e.fovy = 60
	e.min_distance = 0.001  // min line distance
	e.max_distance = 1e4    // max model total distance

	e.camera.pos.set(2.3, 2.8, 3.7)

	function update_camera() {

		camera.update()

		gl.set_uni('view_pos' , camera.pos)
		gl.set_uni('view'     , camera.view)
		gl.set_uni('view_proj', camera.view_proj)

		skybox.update_view(camera.pos)

		update_dot_positions()
	}

	// rendering ---------------------------------------------------------------

	{
		let raf_id
		let do_render = function() {

			skybox.draw()
			axes.draw()

			raf_id = null
		}

		function render() {
			if (!raf_id)
				raf_id = raf(do_render)
		}
	}

	function init() {

		/*
		e.xyplane = xyplane()
		e.zyplane = zyplane()
		e.xzplane = xzplane()
		e.ref_planes = [e.xyplane, e.zyplane, e.xzplane]
		*/

		e.detect_resize()

		function resized(r) {
			e.camera.viewport_w = r.w
			e.camera.viewport_h = r.h
			e.camera.projection(e.fovy,
				e.min_distance * 100,
				e.max_distance * 100)
			render()
		}
		e.on('resize', resized)

	}
	// screen-projected distances for hit testing -----------------------------

	e.snap_distance   = 20  // max pixel distance for snapping
	e.select_distance =  6  // max pixel distance for selecting

	e.hit_d = null // current hit distance, one of the above depending on tool.

	let canvas_p2p_distance2 = e.camera.screen_distance2

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

	// reference planes -------------------------------------------------------

	// intersect infinite line (p1, p2) with its perpendicular from point p.
	let _l0 = line3()
	function point2_hit_line2(p, p1, p2, int_p) {
		return _l0.set(p1, p2).closest_point_to_point(p, false, int_p)
		/*
		let dx = p2.x - p1.x
		let dy = p2.y - p1.y
		let k = dx ** 2 + dy ** 2
		if (k == 0)
			return false // line has no length
		k = ((p.x - p1.x) * dy - (p.y - p1.y) * dx) / k
		int_p.x = p.x - k * dy
		int_p.y = p.y + k * dx
		return true
		*/
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
			let _line4 = line3()

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
	e.model = editable_3d_model({})
	e.model.editor = e

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
				let d1 = plane.distance_to_point(line[0])
				let d2 = plane.distance_to_point(line[1])
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
					let plane_int_p = e.model.line_intersect_face_plane(line, p.face)
					if (!p.face.contains_point(plane_int_p)) { //  e.model.line_intersects_face(line, p.face, line.intersects_face_plane == 1)) {
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
