const express = require("express");
const app = express();

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.use(express.json());
let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({ filename: dbPath, driver: sqlite3.Database });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//Convert db objects to response objects
const convertStateObjectToResponseObject = (dbObject) => {
  return {
    stateId: dbObject.state_id,
    stateName: dbObject.state_name,
    population: dbObject.population,
  };
};
const convertDistrictObjectToResponseObject = (dbObject) => {
  return {
    districtId: dbObject.district_id,
    districtName: dbObject.district_name,
    stateId: dbObject.state_id,
    cases: dbObject.cases,
    cured: dbObject.cured,
    active: dbObject.active,
    deaths: dbObject.deaths,
  };
};

//Authenticate Token
//verifying token in every http api call
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//Login and generate authenticate Token
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `
  SELECT
   *
  FROM user
  WHERE
  username = "${username}";`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//GET API 2 -- return list of all states
app.get(`/states/`, authenticateToken, async (req, res) => {
  const statesQuery = `SELECT * FROM state;`;
  const getStateArray = await db.all(statesQuery);
  res.send(
    getStateArray.map((eachState) =>
      convertStateObjectToResponseObject(eachState)
    )
  );
});

//GET API 3 --return a state based on state id
app.get(`/states/:stateId/`, authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getState = `SELECT * FROM state WHERE state_id = ${stateId};`;
  const state = await db.get(getState);
  res.send(convertStateObjectToResponseObject(state));
});

//Post/Create API 4 --create a district in the district table
app.post(`/districts/`, authenticateToken, async (req, res) => {
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const createDistrictTable = `INSERT INTO 
    district (district_name, state_id, cases, cured, active, deaths)
    VALUES (
        '${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths});`;
  await db.run(createDistrictTable);
  res.send("District Successfully Added");
});

//GET API 5 --Returns a district based on the district ID
app.get(`/districts/:districtId/`, authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const getDistrict = `SELECT * FROM district WHERE district_id = ${districtId};`;
  const district = await db.get(getDistrict);
  res.send(convertDistrictObjectToResponseObject(district));
});

//Delete API 6 --Deletes a district from the district table based on the district ID
app.delete(`/districts/:districtId/`, authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const deleteTable = `DELETE FROM district WHERE district_id = ${districtId};`;
  await db.run(deleteTable);
  res.send("District Removed");
});

// update API 7 --Updates the details of a specific district based on the district ID
app.put(`/districts/:districtId/`, authenticateToken, async (req, res) => {
  const { districtId } = req.params;
  const { districtName, stateId, cases, cured, active, deaths } = req.body;
  const updateDistrictTable = `UPDATE
    district 
    SET 
        district_name ='${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
    WHERE district_id = ${districtId};`;
  await db.run(updateDistrictTable);
  res.send("District Details Updated");
});

//Get API 8
/*Returns the statistics of
total cases, cured, active, deaths of a
specific state based on state ID */

app.get(`/states/:stateId/stats/`, authenticateToken, async (req, res) => {
  const { stateId } = req.params;
  const getStatisticsOfState = `
    SELECT 
        SUM(cases),
        SUM(cured),
        SUM(active),
        SUM(deaths)
    FROM
        district
    WHERE
        state_id = ${stateId};`;
  const stats = await db.get(getStatisticsOfState);
  res.send({
    totalCases: stats["SUM(cases)"],
    totalCured: stats["SUM(cured)"],
    totalActive: stats["SUM(active)"],
    totalDeaths: stats["SUM(deaths)"],
  });
});

module.exports = app;
