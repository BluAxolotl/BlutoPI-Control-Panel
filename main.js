const print = console.log
const internalIp = require('internal-ip')
const path = require('path')
const { spawn } = require('node:child_process')
const ini = require('multi-ini')
const fs = require('fs')

const express = require('express')
const app = express()
const server = require('http').createServer(app);
const io = require('socket.io')(server);

const APPS_PATH = `${__dirname}/apps.ini`

if (!fs.existsSync(APPS_PATH)) { throw new Error("apps.ini Not Found") }

const apps_config = ini.read(APPS_PATH)

const ROOT = (apps_config.root || "..")

var node_apps = Object.keys(apps_config).map(node_app => {
	let obj = apps_config[node_app]
	obj.name = node_app
	return obj
})

var processes = {}
var debug = []

var outs = {}
var counts = {}
var status = {}

node_apps.forEach(node_app => {
	if (outs[node_app.name] == null) {
		outs[node_app.name] = []
		debug[node_app.name] = {}
		debug[node_app.name].error = []
		debug[node_app.name].crash = []
		counts[node_app.name] = {}
		counts[node_app.name].error = 0
		counts[node_app.name].crash = 0
		status[node_app.name] = node_app.status
	}
	if (node_app.status == "ON") { app_spawn(node_app) }
})

Array.prototype.remove = function (index) {
    if (index > -1 && index < this.length-1) {
    	var return_value = this.splice(index, 1)
    	return return_value
    }
}

function app_spawn(node_app) {
	let p = spawn('node', [`${ROOT}/${node_app.package}/${node_app.entry}`])
	p.stdout.on('data', data => {
		print(`[ ${node_app.name} ] ${data}`)
		outs[node_app.name].push(data.toString())
		io.sockets.emit('data', node_app.name, data.toString(), "normal")
	})
	p.stderr.on(`data`, data => {
		print(`[ ${node_app.name} ] ${data}`)
		outs[node_app.name].push(data.toString())
		counts[node_app.name].error++
		debug[node_app.name].error.push({
			text: data.toString(),
			time: Date.now()
		})
		io.sockets.emit('data', node_app.name, data.toString(), "error")
	})
	p.on('error', (err) => {
		print(`[ ${node_app.name} ] ${err}`)
		outs[node_app.name].push(err.toString())
		counts[node_app.name].error++
		debug[node_app.name].error.push({
			text: err.toString(),
			time: Date.now()
		})
		io.sockets.emit('data', node_app.name, err.toString(), "error")
	})
	p.on('exit', (code, str) => {
		if (code != null) {
			let text = `Exited with code: ${code}\n\n\n[ SYSTEM ] Restarting app...\n\n\n`
			print(`[ ${node_app.name} ] ${text}`)
			outs[node_app.name].push(text)
			counts[node_app.name].crash++
			debug[node_app.name].crash.push({
				text: `Exited with code: ${code}`,
				time: Date.now()
			})
			io.sockets.emit('data', node_app.name, text, "exit")
			app_spawn(node_app)
		}
	})
	processes[node_app.name] = p
}

function send_line(app_name, line) {
	let p = processes[app_name]
	p.stdin.cork()
	p.stdin.write(line + "\n")
	p.stdin.uncork()
}

io.on('connection', socket => {
	print(`[ SYSTEM ] + NEW SOCKET CONNECTION`)

	socket.emit('init', node_apps, outs, counts, status)

	socket.on('line', send_line)

	socket.on('print', data => {
		print("[ SYSTEM ] " + data)
	})

	socket.on('debug', (type, app_name) => {
		if (debug[app_name] != null) {
			socket.emit('debug', debug[app_name][type])
		}
	})

	socket.on('toggle', (app_name, pid) => {
		print(status[app_name])
		if (status[app_name] == "ON") {
			status[app_name] = 'OFF'			
			processes[app_name].kill()
			let text = "\n\n\n[ SYSTEM ] PROCESS KILLED BY CONTROL PANEL\n\n\n"
			outs[app_name].push(text)
			socket.emit('data', app_name, text, "normal")
		} else {
			status[app_name] = 'ON'
			app_spawn(node_apps[pid])
		}
		socket.emit('status_change', app_name, status[app_name])
	})
})

app.use('/', express.static(path.join(__dirname, 'website')))

app.get('/', (req, res) => {
  res.sendFile('/index.html', {root: path.join(__dirname, 'website')});
})

app.get('/debug', (req, res) => {
  res.sendFile('/debug.html', {root: path.join(__dirname, 'website')});
})

server.listen(2026, internalIp.v4.sync(), () => {
	print("Lisening on port 2026")
})
