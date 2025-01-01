const serverList = [
  {
    name: "House of Quake [EU]",
    ip: "176.9.114.238:27960",
  },
  {
    name: "CSQL [EU]",
    ip: "176.9.114.238:27961",
  },
  {
    name: "Community Winter CTF [NA]",
    ip: "74.91.112.58:27960",
  },
  {
    name: "quakectf.com (currently freeze tag) [NA]",
    ip: "74.91.112.58:27961",
  },
  // Add more servers here...
];

//Example usage:
function displayServers(){
  serverList.forEach(server => {
    console.log(`${server.name} - ${server.ip}`);
  });
}

displayServers();

