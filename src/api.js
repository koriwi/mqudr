const Connection = require('./connection')
const ChannelPool = require('./channel-pool')
const { EventEmitter } = require('events')

class Api extends EventEmitter {
  constructor (options) {
    super()
    if (typeof options !== 'object') {
      options = { connection: options }
    }
    this.options = Object.assign({
      toExchangeName: (...args) => args.join(':'),
      toQueueName: (...args) => args.join(':'),
    }, options)
    this.connection = new Connection(this.options.connection)
    this.connection.on('error', error => this.emit('error', error))
    this.pool = new ChannelPool(this.connection)
  }

  close () {
    return this.connection.close()
  }

  publishEvent (name, content, options) {
    const exchange = this.options.toExchangeName(name)
    return this.pool.use(channel =>
      channel.declareExchange(exchange, { type: 'fanout' })
        .then(() => channel.publish(exchange, content, options))
    )
  }

  consumeEvent (...args) {
    return this.consumeTransientEvent(...args)
  }

  consumeTransientEvent (name, consumer, options) {
    const exchange = this.options.toExchangeName(name)
    return this.pool.acquire().then(channel =>
      channel.declareExchange(exchange, { type: 'fanout' })
        .then(() => channel.declareQueue('', { autoDelete: true }))
        .then(data => channel.bindQueue(data.queue, exchange).then(() => data))
        .then(data => channel.consume(data.queue, consumer, options))
    )
  }

  consumePersistentEvent (eventName, consumerName, consumer, options) {
    const exchange = this.options.toExchangeName(eventName)
    const queue = this.options.toQueueName(eventName, consumerName)
    return this.pool.acquire().then(channel =>
      channel.declareExchange(exchange, { type: 'fanout' })
        .then(() => channel.declareQueue(queue))
        .then(data => channel.bindQueue(data.queue, exchange).then(() => data))
        .then(data => channel.consume(data.queue, consumer, options))
    )
  }

  publishJob (name, content, options) {
    const queue = this.options.toQueueName(name)
    return this.pool.use(channel =>
      channel.declareQueue(queue)
        .then(() => channel.publish('', content, { routingKey: queue }))
    )
  }
  
  publish (exName, routingKey, content, options) {
    const exchange = this.options.toExchangeName(exName)
    return this.pool.use(channel =>
      channel.publish(exchange, content, { routingKey, ...options })
    )
  }
  
  consume (qname, consumer, options) {
    const queue = this.options.toQueueName(qname)
    return this.pool.acquire().then(channel =>
      channel.consume(queue, consumer, options)
    )
  }
  
  createExchange (name, options = { type: 'fanout' }) {
    const exchange = this.options.toExchangeName(name)
    return this.pool.use(channel =>
      channel.declareExchange(exchange, options)
    )
  }
  
  createQueue (name, options = { autoDelete: false, durable: true }) {
    const queue = this.options.toQueueName(name)
    return this.pool.use(channel =>
      channel.declareQueue(queue, options)
    )
  }
  
  bindQueue (qname, exname, routingKey) {
    const queue = this.options.toQueueName(qname)
    const exchange = this.options.toExchangeName(exname)
    return this.pool.use(channel =>
      channel.bindQueue(queue, exchange, { routingKey })
    )
  }

  consumeJob (name, consumer, options) {
    const queue = this.options.toQueueName(name)
    return this.pool.acquire().then(channel =>
      channel.declareQueue(queue)
        .then(() => channel.consume(queue, consumer, options))
    )
  }
}

module.exports = Api
