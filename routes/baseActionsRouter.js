var express = require('express');
var router = express.Router();
var util = require('util');
var moment = require('moment');
var utils = require('./../app/utils');
var env = require("./../app/env");
var bitcoin = require("bitcoin");
var rpcApi = require("./../app/rpcApi");

router.get("/", function(req, res) {
	if (!req.session.host) {
		if (req.cookies['rpc-host']) {
			res.locals.host = req.cookies['rpc-host'];
		}

		if (req.cookies['rpc-port']) {
			res.locals.port = req.cookies['rpc-port'];
		}

		if (req.cookies['rpc-username']) {
			res.locals.username = req.cookies['rpc-username'];
		}

		res.render("connect");
		res.end();

		return;
	}

	var client = global.client;

	rpcApi.getBlockchainInfo().then(function(getblockchaininfo) {
		res.locals.getblockchaininfo = getblockchaininfo;

		var blockHeights = [];
		if (getblockchaininfo.blocks) {
			for (var i = 0; i < 10; i++) {
				blockHeights.push(getblockchaininfo.blocks - i);
			}
		}

		rpcApi.getBlocksByHeight(blockHeights).then(function(latestBlocks) {
			res.locals.latestBlocks = latestBlocks;

			res.render("index");
		});
	}).catch(function(err) {
		res.locals.userMessage = "Unable to connect to Bitcoin Node at " + env.bitcoind.host + ":" + env.bitcoind.port;

		res.render("index");
	});
});

router.get("/node-info", function(req, res) {
	var client = global.client;

	rpcApi.getBlockchainInfo().then(function(getblockchaininfo) {
		res.locals.getblockchaininfo = getblockchaininfo;

		rpcApi.getNetworkInfo().then(function(getnetworkinfo) {
			res.locals.getnetworkinfo = getnetworkinfo;

			rpcApi.getUptimeSeconds().then(function(uptimeSeconds) {
				res.locals.uptimeSeconds = uptimeSeconds;

				rpcApi.getNetTotals().then(function(getnettotals) {
					res.locals.getnettotals = getnettotals;

					res.render("node-info");

				}).catch(function(err) {
					res.locals.userMessage = "Unable to connect to Bitcoin Node at " + env.bitcoind.host + ":" + env.bitcoind.port;

					res.render("node-info");
				});
			}).catch(function(err) {
				res.locals.userMessage = "Unable to connect to Bitcoin Node at " + env.bitcoind.host + ":" + env.bitcoind.port;

				res.render("node-info");
			});
		}).catch(function(err) {
			res.locals.userMessage = "Unable to connect to Bitcoin Node at " + env.bitcoind.host + ":" + env.bitcoind.port;

			res.render("node-info");
		});
	}).catch(function(err) {
		res.locals.userMessage = "Unable to connect to Bitcoin Node at " + env.bitcoind.host + ":" + env.bitcoind.port;

		res.render("node-info");
	});
});

router.get("/mempool", function(req, res) {
	var client = global.client;

	rpcApi.getMempoolInfo().then(function(getmempoolinfo) {
		res.locals.getmempoolinfo = getmempoolinfo;

		rpcApi.getMempoolStats().then(function(mempoolstats) {
			res.locals.mempoolstats = mempoolstats;

			res.render("mempool");
		});
	}).catch(function(err) {
		res.locals.userMessage = "Unable to connect to Bitcoin Node at " + env.bitcoind.host + ":" + env.bitcoind.port;

		res.render("mempool");
	});
});

router.post("/connect", function(req, res) {
	var host = req.body.host;
	var port = req.body.port;
	var username = req.body.username;
	var password = req.body.password;

	res.cookie('rpc-host', host);
	res.cookie('rpc-port', port);
	res.cookie('rpc-username', username);

	req.session.host = host;
	req.session.port = port;
	req.session.username = username;

	var client = new bitcoin.Client({
		host: host,
		port: port,
		user: username,
		pass: password,
		timeout: 30000
	});

	console.log("created client: " + client);

	global.client = client;

	req.session.userMessage = "<strong>Connected via RPC</strong>: " + username + " @ " + host + ":" + port;
	req.session.userMessageType = "success";

	res.redirect("/");
});

router.get("/blocks", function(req, res) {
	var limit = 20;
	var offset = 0;
	var sort = "desc";

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	if (req.query.sort) {
		sort = req.query.sort;
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.sort = sort;
	res.locals.paginationBaseUrl = "/blocks";

	rpcApi.getBlockchainInfo().then(function(getblockchaininfo) {
		res.locals.blockCount = getblockchaininfo.blocks;
		res.locals.blockOffset = offset;

		var blockHeights = [];
		if (sort == "desc") {
			for (var i = (getblockchaininfo.blocks - offset); i > (getblockchaininfo.blocks - offset - limit); i--) {
				blockHeights.push(i);
			}
		} else {
			for (var i = offset; i < (offset + limit); i++) {
				blockHeights.push(i);
			}
		}
		
		rpcApi.getBlocksByHeight(blockHeights).then(function(blocks) {
			res.locals.blocks = blocks;

			res.render("blocks");
		});
	}).catch(function(err) {
		res.locals.userMessage = "Unable to connect to Bitcoin Node at " + env.bitcoind.host + ":" + env.bitcoind.port;

		res.render("blocks");
	});
});

router.post("/search", function(req, res) {
	if (!req.body.query) {
		req.session.userMessage = "Enter a block height, block hash, or transaction id.";

		res.redirect("/");

		return;
	}

	var query = req.body.query.toLowerCase();

	req.session.query = req.body.query;

	if (query.length == 64) {
		rpcApi.getRawTransaction(query).then(function(tx) {
			if (tx) {
				res.redirect("/tx/" + query);

				return;
			}

			rpcApi.getBlockByHash(query).then(function(blockByHash) {
				if (blockByHash) {
					res.redirect("/block/" + query);

					return;
				}

				req.session.userMessage = "No results found for query: " + query;

				res.redirect("/");

			}).catch(function(err) {
				req.session.userMessage = "No results found for query: " + query;

				res.redirect("/");
			});

		}).catch(function(err) {
			rpcApi.getBlockByHash(query).then(function(blockByHash) {
				if (blockByHash) {
					res.redirect("/block/" + query);

					return;
				}

				req.session.userMessage = "No results found for query: " + query;

				res.redirect("/");

			}).catch(function(err) {
				req.session.userMessage = "No results found for query: " + query;

				res.redirect("/");
			});
		});

	} else if (!isNaN(query)) {
		rpcApi.getBlockByHeight(parseInt(query)).then(function(blockByHeight) {
			if (blockByHeight) {
				res.redirect("/block-height/" + query);

				return;
			}

			req.session.userMessage = "No results found for query: " + query;

			res.redirect("/");
		});
	} else {
		req.session.userMessage = "Invalid query: " + query;

		res.redirect("/");

		return;
	}

	
});

router.get("/block-height/:blockHeight", function(req, res) {
	var client = global.client;

	var blockHeight = parseInt(req.params.blockHeight);

	res.locals.blockHeight = blockHeight;

	res.locals.result = {};

	var limit = 20;
	var offset = 0;

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.paginationBaseUrl = "/block-height/" + blockHeight;

	client.cmd('getblockhash', blockHeight, function(err, result, resHeaders) {
		if (err) {
			// TODO handle RPC error
			return console.log(err);
		}

		res.locals.result.getblockhash = result;

		rpcApi.getBlockData(client, result, limit, offset).then(function(result) {
			res.locals.result.getblock = result.getblock;
			res.locals.result.transactions = result.transactions;
			res.locals.result.txInputsByTransaction = result.txInputsByTransaction;

			res.render("block-height");
		});
	});
});

router.get("/block/:blockHash", function(req, res) {
	var blockHash = req.params.blockHash;

	res.locals.blockHash = blockHash;

	res.locals.result = {};

	var limit = 20;
	var offset = 0;

	if (req.query.limit) {
		limit = parseInt(req.query.limit);
	}

	if (req.query.offset) {
		offset = parseInt(req.query.offset);
	}

	res.locals.limit = limit;
	res.locals.offset = offset;
	res.locals.paginationBaseUrl = "/block/" + blockHash;

	// TODO handle RPC error
	rpcApi.getBlockData(client, blockHash, limit, offset).then(function(result) {
		res.locals.result.getblock = result.getblock;
		res.locals.result.transactions = result.transactions;
		res.locals.result.txInputsByTransaction = result.txInputsByTransaction;

		res.render("block");
	});
});

router.get("/tx/:transactionId", function(req, res) {
	var txid = req.params.transactionId;

	var output = -1;
	if (req.query.output) {
		output = parseInt(req.query.output);
	}

	res.locals.txid = txid;
	res.locals.output = output;

	res.locals.result = {};

	rpcApi.getRawTransaction(txid).then(function(rawTxResult) {
		res.locals.result.getrawtransaction = rawTxResult;

		client.cmd('getblock', rawTxResult.blockhash, function(err3, result3, resHeaders3) {
			res.locals.result.getblock = result3;

			var txids = [];
			for (var i = 0; i < rawTxResult.vin.length; i++) {
				if (!rawTxResult.vin[i].coinbase) {
					txids.push(rawTxResult.vin[i].txid);
				}
			}

			rpcApi.getRawTransactions(txids).then(function(txInputs) {
				res.locals.result.txInputs = txInputs;

				res.render("transaction");
			});
		});
	}).catch(function(err) {
		res.locals.userMessage = "Failed to load transaction with txid=" + txid + " (" + err + ")";

		res.render("transaction");
	});
});

router.get("/rpc-terminal", function(req, res) {
	if (!env.debug) {
		res.send("Debug mode is off.");

		return;
	}

	res.render("terminal");
});

router.post("/rpc-terminal", function(req, res) {
	if (!env.debug) {
		res.send("Debug mode is off.");

		return;
	}

	var params = req.body.cmd.split(" ");
	var cmd = params.shift();
	var parsedParams = [];

	params.forEach(function(param, i) {
		if (!isNaN(param)) {
			parsedParams.push(parseInt(param));

		} else {
			parsedParams.push(param);
		}
	});

	client.cmd([{method:cmd, params:parsedParams}], function(err, result, resHeaders) {
		console.log("Result[1]: " + JSON.stringify(result, null, 4));
		console.log("Error[2]: " + JSON.stringify(err, null, 4));
		console.log("Headers[3]: " + JSON.stringify(resHeaders, null, 4));

		if (err) {
			console.log(JSON.stringify(err, null, 4));

			res.write(JSON.stringify(err, null, 4), function() {
				res.end();
			});

		} else if (result) {
			res.write(JSON.stringify(result, null, 4), function() {
				res.end();
			});

		} else {
			res.write(JSON.stringify({"Error":"No response from node"}, null, 4), function() {
				res.end();
			});
		}
	});
});

router.get("/rpc-browser", function(req, res) {
	if (!env.debug) {
		res.send("Debug mode is off.");

		return;
	}

	rpcApi.getHelp().then(function(result) {
		res.locals.gethelp = result;

		if (req.query.method) {
			res.locals.method = req.query.method;

			rpcApi.getRpcMethodHelp(req.query.method.trim()).then(function(result2) {
				res.locals.methodhelp = result2;

				var lines = result2.split("\n");
				
				var params = [];
				var line1Parts = lines[0].trim().split(" ");
				line1Parts.shift();

				params = line1Parts;

				res.locals.methodParams = params;

				console.log("params: " + params);

				if (req.query.execute) {
					client.cmd([{method:req.query.method, params:[]}], function(err3, result3, resHeaders3) {
						if (err3) {
							res.locals.methodResult = err3;

						} else if (result3) {
							res.locals.methodResult = result3;

						} else {
							res.locals.methodResult = {"Error":"No response from node."};
						}

						res.render("browser");
					});
				} else {
					res.render("browser");
				}
			}).catch(function(err) {
				res.locals.userMessage = "Error loading help content for method " + req.query.method + ": " + err;

				res.render("browser");
			});

		} else {
			res.render("browser");
		}

	}).catch(function(err) {
		res.locals.userMessage = "Error loading help content: " + err;

		res.render("browser");
	});
});


module.exports = router;
