// Replace `<YOUR_NOMINATIM_ENDPOINT>` with the Nominatim API endpoint
var nominatimEndpoint = 'https://nominatim.openstreetmap.org/search';
// Replace `<YOUR_SMASHGG_API_ENDPOINT>` with the Smash.gg API endpoint
var smashGGEndpoint = 'https://api.smash.gg/videogames';

// Initialize the map
var map = L.map('map').setView([0, 0], 2);

// Add a tile layer (you can use other providers or your own)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Define headers and query for fetching data
var token = "fce7d38cd20cfa58739be8d97eb2358b";
var headers = { "Authorization": "Bearer " + token };

async function fetchData(videogameId) {
    try {
        let allTournaments = [];

        // Loop through pages 1 to 5
        for (let page = 1; page <= 5; page++) {
            const response = await fetch('https://api.start.gg/gql/alpha', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    query: `
                      query TournamentsByVideogame($perPage: Int!, $page: Int!, $videogameId: ID!) {
                        tournaments(query: {
                          perPage: $perPage
                          page: $page
                          sortBy: "startAt asc"
                          filter: {
                            upcoming: true
                            videogameIds: [
                              $videogameId
                            ]
                          }
                        }) {
                          nodes {
                            name
                            url
                            lat
                            lng
                            isRegistrationOpen
                            startAt
                          }
                        }
                      }
                    `,
                    variables: {
                        "perPage": 300,
                        "page": page,
                        "videogameId": videogameId
                    }
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const json_data = await response.json();
            const tournaments = json_data.data.tournaments.nodes;

            const filteredTournaments = tournaments.filter(tournament => tournament.isRegistrationOpen !== false);

            allTournaments = allTournaments.concat(filteredTournaments);
        }

        return allTournaments;
    } catch (error) {
        console.error(`Error fetching data: ${error.message}`);
        throw error;
    }
}

// Function to display data on the map
async function displayData(gameId) {
    try {
        const data = await fetchData(gameId);

        data.forEach(tournament => {
            const { name, lat, lng, startAt, url } = tournament;

            // Check if lat and lng are valid numbers and not null
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);

            if (!isNaN(latNum) && !isNaN(lngNum) && lat !== null && lng !== null) {
                // Add marker for each entry using lat and lng directly
                L.marker([latNum, lngNum]).addTo(map)
                    .bindPopup(`<b>${name}</b><br><b>Starts at:</b> ${new Date(startAt * 1000).toLocaleString()}<br><b>Sign Up Link:</b> <a href="https://start.gg${url}" target="_blank">https://start.gg${url}</a>`);
            } else {
                console.error(`Invalid lat/lng values or null for tournament: ${name}`);
            }
        });
    } catch (error) {
        console.error(`Error displaying data: ${error.message}`);
    }
}

// Fetch video games data for search bar autocomplete
async function fetchVideoGames() {
    try {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://api.smash.gg/videogames?callback=handleVideoGamesResponse';
            document.body.appendChild(script);

            // Define the callback function to handle the response
            window.handleVideoGamesResponse = function(response) {
                if (response) {
                    // Extract the list of video games from the response
                    const videoGames = response.entities.videogame.map(game => ({
                        id: game.id,
                        name: game.name
                    }));
                    resolve(videoGames);
                } else {
                    reject(new Error('No data received from the server.'));
                }
                // Clean up
                delete window.handleVideoGamesResponse;
                document.body.removeChild(script);
            };
        });
    } catch (error) {
        console.error(`Error fetching video games data: ${error.message}`);
        throw error;
    }
}

// Autocomplete search bar with video games data
async function autocompleteSearch() {
    try {
        const videoGames = await fetchVideoGames();
        const input = document.getElementById('game-search');

        // Initialize Awesomplete autocomplete
        new Awesomplete(input, {
            list: videoGames.map(game => game.name),
            autoFirst: true,
            filter: Awesomplete.FILTER_STARTSWITH
        });
    } catch (error) {
        console.error(`Error setting up autocomplete: ${error.message}`);
    }
}

// Function to trigger search
async function search() {
    const input = document.getElementById('game-search');
    const selectedGameName = input.value;
    if (selectedGameName.trim() !== '') {
        const videoGames = await fetchVideoGames();
        const selectedGame = videoGames.find(game => game.name === selectedGameName);
        if (selectedGame) {
            // Show loading spinner
            document.getElementById('map-loading-spinner').style.display = 'block';
            map.eachLayer(layer => {
                if (layer instanceof L.Marker) {
                    map.removeLayer(layer);
                }
            });
            await displayData(selectedGame.id);
            // Hide loading spinner after data is displayed
            document.getElementById('map-loading-spinner').style.display = 'none';
        }
    }
}

// Call the function to set up autocomplete
autocompleteSearch();
