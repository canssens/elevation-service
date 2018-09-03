const { json, send } = require("micro");
const limitedMap = require("limited-map");
const query = require("micro-query");
const { FileTileSet, S3TileSet } = require("./tileset");
const https = require('https');


const cacheSize = process.env.TILE_SET_CACHE || 128;
const tileFolder = process.env.TILE_SET_PATH || __dirname;
const maxPostSize = process.env.MAX_POST_SIZE || "500kb";
const maxParallelProcessing = 500;

const tiles = tileFolder.startsWith("s3://")
  ? new S3TileSet({ cacheSize })
  : new FileTileSet(tileFolder, { cacheSize });


async function handlePOST(req, res) {
  const payload = await json(req, { limit: maxPostSize });

  payloadArray = [];

  if (!payload.locations ) {
    return send(res, 400, {
      error:
        "Invalid Payload. Expected a JSON locations with latitude-longitude pairs: {latitude:xxx,longitude:xxx}"
    });
  }

  payload.locations.forEach(function(aLocation) {
    payloadArray.push([aLocation.latitude, aLocation.longitude]);
  });


  if (
    !payload ||
    !Array.isArray(payloadArray) ||
    !payloadArray.every(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng))
  ) {
    return send(res, 400, {
      error:
        "Invalid Payload. Expected a JSON array with latitude-longitude pairs: [[lat, lng], ...]"
    });
  }

  const result = await limitedMap(
    payloadArray,
    ll => tiles.getElevation(ll),
    maxParallelProcessing
  );
  return {"results" : result };
}

async function handleGET(req, res) {
  const reqQuery = query(req);
  const lat = parseFloat(reqQuery.lat);
  const lng = parseFloat(reqQuery.lng);
  if (lat == null || !Number.isFinite(lat)) {
    return send(res, 400, {
      error:
        "Invalid Latitude. Expected a float number as query parameter: ?lat=12.3&lng=45.6"
    });
  }
  if (lng == null || !Number.isFinite(lng)) {
    return send(res, 400, {
      error:
        "Invalid Longitude. Expected a float number as query parameter: ?lat=12.3&lng=45.6"
    });
  }
  const result = await tiles.getElevation([lat, lng]);
  return result;
}


async function handleGETStatus(req, res) {

  return send(res, 200);

  /*
  const options = {
    hostname: 'elevation-tiles-prod.s3.amazonaws.com',
    port: 443,
    path: '/skadi/N00/N00E000.hgt.gz',
    method: 'HEAD'
  };
  
  
  const reqStatusS3 = https.request(options, (resStatusS3) => {
    console.log('statusCode:', resStatusS3.statusCode);
    
    if (resStatusS3.statusCode == "200") return send(res, 200);

  });
  
  reqStatusS3.on('error', (e) => {
    return send(res, 500, { error: "S3 broken" });
  });
  reqStatusS3.end();

  //return send(res, 500, { error: "Unkwnow error" });
  */
}

module.exports = async (req, res) => {
  if (req.method == "GET" && req.url == "/status") {
    return handleGETStatus(req, res);
  }
  else
  {
    switch (req.method) {
      case "POST":
        return handlePOST(req, res);
      case "GET":
        return handleGET(req, res);
      default:
        return send(res, 405, { error: "Only GET or POST allowed" });
    }
  }
};
