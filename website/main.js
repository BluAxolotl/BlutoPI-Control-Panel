var Panels = []

var panel_container = document.getElementById("panel-container")

var updateCount = {}

var inputs = []

function addLine(term, text, time) {
	let a = term.scrollTop
	let b = term.scrollHeight - term.clientHeight
	let c = (a / b)*100;
	if ((c) > 98 || Number.isNaN(c)) {
		setTimeout(() => { term.scrollTo(0, term.scrollHeight) }, 1)
	}
	let line = document.createElement('p')
	line.innerText = text
	line.setAttribute('title', moment(time).format("MMM Do, YYYY [at] h:mm:ss A"))
	line.classList.add("term-line")
	term.appendChild(line)
}

socket.on('init', (apps, outs, g_counts, g_status) => {
	panel_container.replaceChildren()
	apps.forEach((app, ind) => {
		let status = g_status[app.name]
		let counts = g_counts[app.name]
		let local_out = outs[app.name]
		var panel = document.createElement('div')
		panel.classList.add('panel')
		panel.setAttribute('warn', 0)
		panel.setAttribute('err', counts.error)
		panel.setAttribute('crash', counts.crash)

		let app_title = document.createElement('div')
		app_title.classList.add("app-title")
		let app_icon = document.createElement('img')
		app_icon.src = `icons/${app.name}.png`
		app_icon.classList.add('app-icon')
		app_title.innerHTML = `${app_icon.outerHTML}&#8192${app.name}`
		panel.appendChild(app_title)

		let on_ind = document.createElement('div')
		on_ind.classList.add("indicator")
		on_ind.onclick = () => { socket.emit("toggle", app.name, ind) }
		on_ind.id = `status-${app.name}`
		let on_icon = document.createElement('div')
		on_icon.classList.add("icon")
		on_icon.id = `statusicon-${app.name}`
		if (status == "ON") {
			on_icon.style = "background: #139D08"
			on_ind.innerHTML = `${on_icon.outerHTML}<b>ONLINE</b>`
		} else {
			on_icon.style = "background: #7B7B7B"
			on_ind.innerHTML = `${on_icon.outerHTML}<b>OFFLINE</b>`
		}
		panel.appendChild(on_ind)

		let err_ind = document.createElement('div')
		err_ind.classList.add("indicator")
		err_ind.onclick = () => { window.open(`/debug/?app=${app.name}&type=error`, '_blank') }
		let err_icon = document.createElement('div')
		err_icon.innerText = "!"
		err_icon.style = "background: #FFBB31"
		err_icon.classList.add("icon")
		err_ind.innerHTML = `${err_icon.outerHTML}<b>${panel.getAttribute('err')}</b>&#160Errors${(panel.getAttribute('err') > 0 ? "" : "!")}`
		panel.appendChild(err_ind)

		let crash_ind = document.createElement('div')
		crash_ind.classList.add("indicator")
		crash_ind.onclick = () => { window.open(`/debug/?app=${app.name}&type=crash`, '_blank') }
		let crash_icon = document.createElement('div')
		crash_icon.innerText = "X"
		crash_icon.style = "background: #E03C28"
		crash_icon.classList.add("icon")
		crash_ind.innerHTML = `${crash_icon.outerHTML}<b>${panel.getAttribute('crash')}</b>&#160Crashes${(panel.getAttribute('crash') > 0 ? "" : "!")}`
		panel.appendChild(crash_ind)

		let terminal = document.createElement('div')
		terminal.id = `term-${app.name}`
		terminal.classList.add('terminal')
		panel.appendChild(terminal)
		local_out.forEach(data => {
			addLine(terminal, data.text, data.time)
		})

		let input_div = document.createElement('div')
		let input = document.createElement('input')
		input.classList.add('input')
		inputs.push(input)
		input.setAttribute('app', app.name)
		let sym = document.createElement('div')
		sym.classList.add('sym')
		sym.innerText = "$"

		input_div.appendChild(sym)
		input_div.appendChild(input)
		panel.appendChild(input_div)

		updateCount[app.name] = (q) => {
			let new_val = Number(panel.getAttribute(q)) + 1
			panel.setAttribute(q, new_val)
			switch (q) {
				case 'err':
					err_ind.innerHTML = `${err_icon.outerHTML}<b>${new_val}</b>&#160Errors`
				break;
				case 'crash':
					crash_ind.innerHTML = `${crash_icon.outerHTML}<b>${new_val}</b>&#160Crashes`
				break;
			}
		}

		panel_container.appendChild(panel)
	})
})

socket.on('data', (app_name, data, time, type) => {
	var terminal = document.getElementById(`term-${app_name}`)
	addLine(terminal, data, time)
	switch (type) {
		case "error":
			updateCount[app_name]("err")
		break;
		case "exit":
			updateCount[app_name]("crash")
		break;
	}
})

socket.on('status_change', (app_name, status) => {
	let on_ind = document.getElementById(`status-${app_name}`)
	let on_icon = document.getElementById(`statusicon-${app_name}`)
	if (status == "ON") {
		on_icon.style = "background: #139D08"
		on_ind.innerHTML = `${on_icon.outerHTML}<b>ONLINE</b>`
	} else {
		on_icon.style = "background: #7B7B7B"
		on_ind.innerHTML = `${on_icon.outerHTML}<b>OFFLINE</b>`
	}
})

window.addEventListener('keydown', async (e) => { // SENDING A MESSAGE
switch (event.which) {
	case 13:
		if (inputs.includes(document.activeElement)) {
			let input = document.activeElement
			let app_name = input.getAttribute('app')
			socket.emit('line', app_name, input.value)
			input.value = ""
		}
	break;
}
})