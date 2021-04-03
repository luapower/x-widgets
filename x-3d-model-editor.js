/*

	3D model editor widget.
	Written by Cosmin Apreutesei. Public Domain.

*/

DEBUG = 0

// colors --------------------------------------------------------------------

let white = 0xffffff
let black = 0x000000
let selected_color = 0x0000ff
let ref_color = 0xff00ff

component('x-modeleditor', function(e) {

	let pe = e

	e.x_axis_color = 0x990000
	e.y_axis_color = 0x000099
	e.z_axis_color = 0x006600

	// canvas & webgl context -------------------------------------------------

	let canvas = tag('canvas')
	focusable_widget(e, canvas)
	canvas.attr('tabindex', -1)
	e.add(canvas)

	let gl = assert(canvas.getContext('webgl2'))
	//gl.wrap_calls()

	// props ------------------------------------------------------------------

	let skybox = gl.skybox({
		images: {
			posx: 'skybox/posx.jpg',
			negx: 'skybox/negx.jpg',
			posy: 'skybox/posy.jpg',
			negy: 'skybox/negy.jpg',
			posz: 'skybox/posz.jpg',
			negz: 'skybox/negz.jpg',
		},
	})
	skybox.on('load', render)

	let axes_rr = gl.axes_renderer()
	axes_rr.add_instance()

	//let ground_rr = gl.ground_plane_renderer()

	// camera -----------------------------------------------------------------

	let camera = camera3()
	let min_distance = 0.001  // min line distance
	let max_distance = 1e4    // max model total distance

	function update_camera_proj() {
		camera.viewport_w = canvas.width
		camera.viewport_h = canvas.height
		if (e.projection == 'ortho') {
			camera.ortho(-10, 10, -10, 10, -1e2, 1e2)
		} else {
			camera.fov  = e.fov
			camera.near = min_distance * 100
			camera.far  = max_distance * 100
			camera.perspective()
		}
		gl.set_uni('proj', camera.proj)
		update_camera()
	}

	e.set_ortho = function(v) { update_camera_proj() }
	e.set_fov   = function(v) { update_camera_proj() }
	e.set_camera_pos = function(v) { camera.pos.set(v); update_camera() }
	e.set_camera_dir = function(v) { camera.dir.set(v); update_camera() }
	e.set_camera_up  = function(v) { camera .up.set(v); update_camera() }
	e.set_shadows  = function(v) { renderer.enable_shadows = v; update_renderer() }

	e.set_sunlight  = function(v) { update_sunlight_pos() }
	e.set_time      = function(v) { update_sun_pos() }
	e.set_north     = function(v) { update_sun_pos() }
	e.set_latitude  = function(v) { update_sun_pos() }
	e.set_longitude = function(v) { update_sun_pos() }

	e.prop('projection' , {store: 'var', type: 'enum'  , enum_values: ['perspective', 'ortho'], default: 'perspective'})
	e.prop('fov'        , {store: 'var', type: 'number', default: 60})
	e.prop('camera_pos' , {store: 'var', type: 'v3', default: camera.pos})
	e.prop('camera_dir' , {store: 'var', type: 'v3', default: camera.dir})
	e.prop('camera_up'  , {store: 'var', type: 'v3', default: camera.up })
	e.prop('shadows'    , {store: 'var', type: 'boolean', default: false})

	e.prop('sunlight'   , {store: 'var', type: 'boolean', default: false})
	e.prop('time'       , {store: 'var', type: 'datetime', default: 1596272400})
	e.prop('north'      , {store: 'var', type: 'number', default: 0})
	e.prop('latitude'   , {store: 'var', type: 'number', default: 44.42314})
	e.prop('longitude'  , {store: 'var', type: 'number', default: 26.35673})

	let sun_dir = v3()
	function update_sun_pos() {
		let {azimuth, altitude} = suncalc.sun_position(e.time, e.latitude, e.longitude)
		sun_dir.set(v3.z_axis)
			.rotate(v3.x_axis, -altitude)
			.rotate(v3.y_axis, -azimuth + rad * e.north)
		if (e.sunlight || e.shadows)
			update_sunlight_pos()
	}

	function update_sunlight_pos() {
		if (e.sunlight || e.shadows) {
			renderer.sunlight_dir.set(sun_dir).set(.18, 1, .2)
		} else {
			renderer.sunlight_dir.set(camera.dir)
		}
		renderer.update()
		render()
	}

	function update_camera() {
		camera.update()
		fire_pointermove()
		gl.set_uni('view_pos' , camera.pos)
		gl.set_uni('view'     , camera.view)
		gl.set_uni('view_proj', camera.view_proj)
		skybox.update_view(camera.pos)
		update_dot_positions()
		if (!(e.sunlight || e.shadows))
			update_sunlight_pos()
		render()
	}

	// rendering ---------------------------------------------------------------

	let renderer = gl.scene_renderer({
		enable_shadows: e.shadows,
	})

	function draw(prog) {
		//gl.start_trace()
		let t0 = time()
		skybox.draw(prog)
		axes_rr.draw(prog)
		//ground_rr.draw(prog)
		e.model.draw(prog)
		//print(gl.stop_trace())
		//print(((time() - t0) * 1000).toFixed(0), 'ms')
	}

	let raf_id
	function do_render() {
		renderer.render(draw)
		raf_id = null
	}

	function render() {
		if (!raf_id)
			raf_id = raf(do_render)
		mouse.valid = false
	}

	/*
	e.xyplane = xyplane()
	e.zyplane = zyplane()
	e.xzplane = xzplane()
	ref_planes = [e.xyplane, e.zyplane, e.xzplane]
	*/

	e.detect_resize()

	e.on('resize', function(r) {
		canvas.width = r.w
		canvas.height = r.h
		gl.set_uni('viewport_size', r.w, r.h)
		update_camera_proj()
	})

	// screen-projected distances for hit testing -----------------------------

	let snap_distance   = 20  // max pixel distance for snapping
	let select_distance =  6  // max pixel distance for selecting

	e.hit_d = null // current hit distance, one of the above depending on tool.

	let canvas_p2p_distance2 = camera.screen_distance2

	// cursor -----------------------------------------------------------------

	{
		let cursor_x = {line:  0}
		let cursor_y = {line: 25}
		let cursor
		e.property('cursor', () => cursor, function(name) {
			if (cursor == name)
				return
			cursor = name
			let x = cursor_x[name] || 0
			let y = cursor_y[name] || 0
			e.style.cursor = 'url(cursor_'+name+'.png) '+x+' '+y+', auto'
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
				tooltip.x = mouse.x
				tooltip.y = mouse.y
				show_tooltip_after(.2)
			} else {
				show_tooltip_after(false)
			}
		})
	}

	// colored fat helper lines -----------------------------------------------

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

		let geo = new THREE.BufferGeometry().setFromPoints([line[0], line[1]])

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
			let p1 = e.line[0]
			let p2 = e.line[1]
			pb.setXYZ(0, p1.x, p1.y, p1.z)
			pb.setXYZ(1, p2.x, p2.y, p2.z)
			pb.needsUpdate = true
		}

		e.update_endpoints = function(p1, p2) {
			e.line[0].copy(p1)
			e.line[1].copy(p2)
			e.update()
			e.visible = true
		}

		pe.scene.add(e)

		return e

	}

	// html-rendered helper dots ----------------------------------------------

	e.dot = function(point, text, text_class) {

		let s = 'model-editor-dot'
		let e = div({class: (text != null ? s+'-debug '+s+'-debug-'+text_class : s)})
		if (text != null)
			e.set(text)

		e.point = point || v3()

		let p = v3()
		e.update = function() {
			p.copy(e.point).project(camera)
			let x = round(( p.x + 1) * canvas.width  / 2)
			let y = round((-p.y + 1) * canvas.height / 2)
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
				e.line.line[1].z = len
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

				let p1 = axis_position.project_to_canvas(camera, _p1)
				let p2 = _p2.copy(axis_position).add(main_axis).project_to_canvas(camera, _p2)
				let hit = point2_hit_line2(mouse, p1, p2, int_p)
				if (!hit)
					return
				let ds = _p1.set(mouse.x, mouse.y, 0).distanceToSquared(int_p)
				if (ds > pe.hit_d ** 2)
					return

				// get hit point in 3D space by raycasting to int_p.

				update_raycaster(int_p)
				_line1.copy(mouse.ray)
				update_raycaster(mouse)

				_p3.copy(axis_position)
				_p4.copy(axis_position).add(main_axis)

				let int_line = _line1.intersectLine(_line2, false, _line3)
				if (!int_line)
					return

				int_p.copy(int_line[1])
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
			main_axis_line[0].copy(axis_position)
			main_axis_line[1].copy(axis_position).add(main_axis)
			if (!main_axis_line.intersectLine(line, false, int_line))
				return
			let ds = int_line[0].distanceToSquared(int_line[1])
			if (ds > NEARD ** 2)
				return
			int_p.copy(int_line[1])
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
			for (let plane of ref_planes)
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
			for (let plane of ref_planes) {
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
		for (let plane of ref_planes)
			if (plane.point_along_main_axis(p, axes_origin))
				return true
	}

	// model ------------------------------------------------------------------

	e.model = model3({gl: gl})
	e.model.editor = e

	// direct-manipulation tools ==============================================

	let tools = {}

	// orbit tool -------------------------------------------------------------

	tools.orbit = {}

	tools.orbit.pointerdown = function(capture) {
		let cam0 = camera.clone()
		let mx0 = mouse.x
		let my0 = mouse.y
		let hit_point = v3().set(mouse.hit_point)
		let panning = shift
		return capture(function() {
			let mx = mouse.x
			let my = mouse.y
			if (shift == !panning) {
				cam0.set(camera)
				mx0 = mx
				my0 = my
				panning = shift
			} else {
				camera.set(cam0)
			}
			if (panning) {
				camera.pan(hit_point, mx0, my0, mx, my)
			} else {
				let dx = (mx - mx0) / 150
				let dy = (my - my0) / 150
				camera.orbit(hit_point, dy, dx, 0)
			}
			update_camera()
		})
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
			let plane = p.face.plane()

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
				if (line.intersects_face_plane) {
					let plane_int_p = e.model.line_intersect_face_plane(line, p.face)
					if (!p.face.contains_point(plane_int_p)) { //  e.model.line_intersects_face(line, p.face, line.intersects_face_plane == 1)) {
						return false
					}
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

	let cur_point, cur_line, ref_point, ref_line

	tools.line.bind = function(on) {
		if (on) {
			let endp = v3()
			cur_point = e.dot(endp)
			cur_point.visible = false

			cur_line = e.line('cur_line', line3(v3(), endp))
			cur_line.color = black
			cur_line.visible = false

			ref_point = e.dot()
			ref_point.point.snap = 'ref_point'
			ref_point.visible = false

			ref_line = e.line('ref_line', line3(), true)
			ref_line.visible = false
		} else {
			cur_point = cur_point.free()
			cur_line  = cur_line.free()
			ref_point = ref_point.free()
			ref_line  = ref_line.free()
		}
	}

	tools.line.cancel = function() {
		e.tooltip = ''
		cur_line.visible = false
		ref_point.visible = false
		ref_line.visible = false
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
		y_axis: e.y_axis_color,
		x_axis: e.x_axis_color,
		z_axis: e.z_axis_color,
		line_point_intersection: ref_color,
	}

	let future_ref_point = v3()
	let ref_point_update_after = timer(function() {
		ref_point.update_point(future_ref_point)
	})

	tools.line.pointermove = function() {

		let cline = cur_line.line
		let p1 = cline[0]
		let p2 = cline[1]
		p2.i = null
		p2.face = null
		p2.li = null
		p2.snap = null
		p2.line_snap = null
		p2.tooltip = null

		ref_line.snap = null
		ref_line.visible = false

		ref_point_update_after(false)

		e.hit_d = snap_distance
		let p = mouse_hit_model(cur_line.visible ? p1 : null, true)

		if (p) {

			// change the ref point.
			if ((p.snap == 'point' || p.snap == 'line_middle')
				&& (p.i == null || !cur_line.visible || p.i != cline[0].i)
			) {
				assign(future_ref_point, p)
				ref_point_update_after(.5)
			}

			if (!cur_line.visible) { // moving the start point

				if (!p.snap) { // free-moving point.

					// snap point to axes originating at the ref point.
					if (ref_point.visible) {
						let axes_int_p = mouse_hit_axes(ref_point.point)
						if (axes_int_p) {
							p = axes_int_p
							ref_line.snap = p.line_snap
							ref_line.update_endpoints(ref_point.point, p)
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
					if (ref_point.visible) {
						assign(p2, p)
						let p_line_snap = p.line_snap
						let axes_int_p = axes_hit_line(ref_point.point, p, cline)
						if (axes_int_p && canvas_p2p_distance2(axes_int_p, p) <= e.hit_d ** 2) {
							assign(p, axes_int_p)
							ref_line.snap = axes_int_p.line_snap
							p.line_snap = p_line_snap
							ref_line.update_endpoints(ref_point.point, p)
						}

					}

					// TODO: check again if the snapped point hits the model.

				}

				assign(p2, p)

			}

		}

		p = p2

		cur_point.visible = !!p.snap
		e.tooltip = snap_tooltips[p.snap || p.line_snap] || p.tooltip
		cur_point.snap = p2.snap
		cur_line.color = or(line_snap_colors[p2.line_snap], black)
		ref_line.color = or(line_snap_colors[ref_line.snap], black)

		cur_point.update()
		cur_line.update()
		ref_line.update()

		render()
	}

	tools.line.pointerdown = function() {
		e.tooltip = ''
		let cline = cur_line.line
		if (cur_line.visible) {
			let closing = cline[1].i != null || cline[1].li != null
			e.model.draw_line(cline)
			ref_point.visible = false
			if (closing) {
				tools.line.cancel()
			} else {
				cline[0].copy(cline[1])
				cline[0].i = cline[1].i
			}
		} else {
			if (cline[0].i != null && ref_point.point.i == cline[0].i)
				ref_point.visible = false
			cur_line.visible = true
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
				} else {
					p = null
					e.model.select_all(false)
				}
				hit_p = p
				if ((hit_p && hit_p.face) !== (p && p.face)) // hit face changed
					render()
			}
		}

		let _line = line3()

		function move() {
			if (!pull)
				start()
			let p = mouse_hit_model()
			if (!p || !pull.can_hit(p)) {
				let int_line = mouse.ray.intersectLine(pull.dir, false, _line)
				if (int_line)
					p = int_line[0]

			}
			if (p)
				pull.pull(p)
		}

		function start() {
			pull = e.model.start_pull(hit_p)
		}

		function stop() {
			pull.stop()
			pull = null
			e.model.select_all(false)
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
			mode = shift && ctrl && 'remove'
				|| shift && 'toggle' || ctrl && 'add' || null
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
			e.hit_d = select_distance
			p = mouse_hit_model()
			if (!p && nclicks == 1 && !mode) {
				e.model.select_all(false)
			} else if (p && nclicks == 3) {
				e.model.select_all(true)
			} else if (p && nclicks <= 2) {
				if (p.li != null) {
					e.model.select_line(p.li, mode, nclicks == 2)
				} else if (p.face != null) {
					e.model.select_face(p.face, mode, nclicks == 2)
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
				fire_pointermove()
				render()
			}
		})
	}

	// mouse handling ---------------------------------------------------------

	let mouse = v2()
	mouse.ray = line3()
	mouse.hit_point = v3()

	{
		let _m0 = mat4()
		let _p0 = v3()
		let _p1 = v3()
		let _ray = line3()
		let hit = {}
		function update_mouse(ev, mx, my, validate, left_down, no_pointermove) {
			if (!mouse.valid && validate) {
				e.model.update_mouse()
				mouse.valid = true
			}
			let r = e.rect()
			mx -= r.x
			my -= r.y
			mouse.x = mx
			mouse.y = my
			if (left_down != null)
				mouse.left = left_down
			update_keys(ev)
			camera.raycast(mx, my, mouse.ray)
			let inst_model, inst_point, face
			if (e.model.hit_test(mx, my, hit)) {
				let comp = hit.comp
				let model = hit.inst
				let inv_model = _m0.set(model).invert()
				let ray = _ray.set(mouse.ray).transform(inv_model)
				let face = hit.face
				inst_point = face.plane().intersect_line(ray, null, _p0)
				if (inst_point) {
					mouse.hit_point.set(inst_point).transform(model)
					inst_model = model
				}
			} else {
				mouse.ray.at(min(FAR / 10, camera.pos.len()), mouse.hit_point)
			}
			mouse.inst_model = inst_model
			mouse.inst_point = inst_point
			mouse.face = face

			if (no_pointermove)
				fire_pointermove()
		}
	}

	let shift, ctrl, alt
	function update_keys(ev) {
		shift = ev.shiftKey
		ctrl  = ev.ctrlKey
		alt   = ev.altKey
	}

	function fire_pointermove() {
		if (tool.pointermove)
			tool.pointermove()
	}

	e.on('pointermove', function(ev, mx, my) {
		update_mouse(ev, mx, my)
	})

	e.on('pointerdown', function(ev, mx, my) {
		update_mouse(ev, mx, my, true, true)
		if (tool.pointerdown) {
			let captured
			function capture(move, up) {
				let movewrap = move && function(ev, mx, my) {
					update_mouse(ev, mx, my, false, null, true)
					return move()
				}
				let upwrap = up && function(ev, mx, my) {
					update_mouse(ev, mx, my, true, false, true)
					return up()
				}
				captured = e.capture_pointer(ev, movewrap, upwrap)
			}
			tool.pointerdown(capture)
			fire_pointermove()
			render()
			return captured
		}
	})

	e.on('pointerup', function(ev, mx, my) {
		update_mouse(ev, mx, my, true, false)
		if (tool.pointerup) {
			tool.pointerup()
			fire_pointermove()
			render()
		}
	})

	e.on('pointerleave', function(ev) {
		e.tooltip = ''
	})

	e.on('click', function(ev, nclicks, mx, my) {
		update_mouse(ev, mx, my, true)
		if (tool.click) {
			tool.click(nclicks)
			fire_pointermove()
			render()
		}
	})

	e.on('wheel', function(ev, dy, mx, my) {
		update_mouse(ev, mx, my, true)
		camera.dolly(mouse.hit_point, 1 + 0.4 * dy)
		update_camera()
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
			render()
		} else if (key == 'h') {
			e.model.toggle_invisible_lines()
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

		let mat1 = e.model.add_material({diffuse_color: 0xff9900})
		let mat2 = e.model.add_material({diffuse_color: 0x0099ff})

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
				 0,  0,  0,
				-1,  1,  0,
			],
			faces: [
				[1, 0, 3, 2],
				[4, 5, 6, 7],
				[7, 6, 2, 3], //[6, 2, 3],
				[4, 0, 1, 5],
				[0, 4, 7, 3],
				[5, 1, 2, 6],
			],
			lines: [
				8, 9,
			],
		}

		m.faces[0].material = mat1
		m.faces[1].material = mat1
		m.faces[2].material = mat2

		e.model.root.name = 'root'
		e.model.root.set(m)

		e.model.root.set_line_smoothness(0, 1)
		e.model.root.set_line_smoothness(2, 1)
		e.model.root.set_line_opacity(0, 0)
		e.model.root.set_line_opacity(2, 0)

		let c1 = model3_component({model: e.model, name: 'c1'})

		m.faces[0].material = null
		m.faces[1].material = null
		m.faces[2].material = null

		c1.set(m)

		e.model.root.add_child(c1, mat4().translate(3, 0, 0))
		e.model.root.add_child(c1, mat4().translate(4, 3, 0))

		for (let i = 0; i < 20; i++)
			for (let j = 0; j < 2; j++)
				for (let k = 0; k < 2; k++)
					e.model.root.add_child(c1, mat4().translate(0 + i * 3, 3 + j * 3, -5 - k * 3))

	}

	// init -------------------------------------------------------------------

	update_sun_pos()

	draw_test_cube()

	e.tool = 'orbit'
	render()

})
