const path = require('path')
const http = require('http')
const express = require('express')
const socketio = require('socket.io')
const formatMessage = require('./utils/messages')
const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers
} = require('./utils/users')

const app = express()
const server = http.createServer(app)
const io = socketio(server)

const bodyParser = require('body-parser')
const ejs = require('ejs')

const DatabaseManager = require('denky-database')
global.db = new DatabaseManager('./database.json')

// Set static folder
app.engine('html', ejs.renderFile)
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '/pages'))
app.use(express.json())
app.use(express.static(path.join(__dirname, '/public')))
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

const botName = 'Trufens Bot'

app.get('/', async (req, res) => {
  const rooms = await global.db.get('rooms') || []
  res.render('index', {
    rooms
  })
})

app.post('/api/createroom', async (req, res) => {
  const { username, roomName } = req.body
  if (!global.db.get('rooms')) {
    global.db.set('rooms', [])
  }
  global.db.push('rooms', {
    name: roomName,
    owner: username
  })
  res.redirect(`/chat?username=${username}&room=${roomName}`)
})

app.post('/api/deleteroom', async (req, res) => {
  const { roomName } = req.body
  if (!global.db.get('rooms')) {
    global.db.set('rooms', [])
  }
  global.db.pull('rooms', roomName)
  res.redirect('/')
})

app.get('/chat', async (req, res) => {
  const messages = await global.db.get(`messages.${req.query.room}`) || []
  const rooms = global.db.get('rooms') || []
  const onwer = rooms.find(room => room.name === req.query.room).owner
  res.render('chat', {
    msgs: messages,
    owner: onwer,
    room: req.query.room,
    user: req.query.username
  })
})

// Run when client connects
io.on('connection', socket => {
  socket.on('joinRoom', ({ username, room }) => {
    const user = userJoin(socket.id, username, room)

    socket.join(user.room)

    // Welcome current user
    socket.emit('message', formatMessage(botName, 'Welcome to Trufrens!'))

    // Broadcast when a user connects
    socket.broadcast
      .to(user.room)
      .emit(
        'message',
        formatMessage(botName, `${user.username} has joined the chat`)
      )

    // Send users and room info
    io.to(user.room).emit('roomUsers', {
      room: user.room,
      users: getRoomUsers(user.room)
    })
  })

  // Listen for chatMessage
  socket.on('chatMessage', async msg => {
    const user = getCurrentUser(socket.id)
    if (!global.db.get(`messages.${user.room}`)) {
      await global.db.set(`messages.${user.room}`, [])
    }
    await global.db.push(`messages.${user.room}`, {
      username: user.username,
      message: msg
    })
    io.to(user.room).emit('message', formatMessage(user.username, msg))
  })

  // Runs when client disconnects
  socket.on('disconnect', () => {
    const user = userLeave(socket.id)

    if (user) {
      io.to(user.room).emit(
        'message',
        formatMessage(botName, `${user.username} has left the chat`)
      )

      // Send users and room info
      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getRoomUsers(user.room)
      })
    }
  })
})

const PORT = process.env.PORT || 3000

server.listen(PORT, () => console.log(`Server running on port ${PORT}`))
