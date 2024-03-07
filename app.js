// Replace `<YOUR_NOMINATIM_ENDPOINT>` with the Nominatim API endpoint
var nominatimEndpoint = 'https://nominatim.openstreetmap.org/search';
// Replace `<YOUR_SMASHGG_API_ENDPOINT>` with the Smash.gg API endpoint
var smashGGEndpoint = 'cache.json';

// Function to request location permission and zoom if allowed
function requestLocationAndZoom() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function (position) {
            // Get user's current location
            var latitude = position.coords.latitude;
            var longitude = position.coords.longitude;

            // Initialize the map with the user's location
            map.setView([latitude, longitude], 3); // Set initial zoom level to 10

            // Get the current zoom level
            var currentZoom = map.getZoom();

            // Target zoom level
            var targetZoom = 10; // Adjust the target zoom level here

            // Calculate the difference between current and target zoom levels
            var zoomDiff = targetZoom - currentZoom;

            // Duration for the animation (in milliseconds)
            var duration = 3000; // Adjust the duration here (in milliseconds)

            // Interval time for each step in the animation
            var interval = 20; // Adjust the interval here (in milliseconds)

            // Number of steps in the animation
            var steps = duration / interval;

            // Calculate the zoom increment per step
            var zoomIncrement = zoomDiff / steps;

            // Initialize the counter for the steps
            var stepCount = 0;

            // Define the function to zoom gradually
            function gradualZoom() {
                // Increment the step count
                stepCount++;

                // Calculate the new zoom level for this step
                var newZoom = currentZoom + zoomIncrement * stepCount;

                // Set the new zoom level
                map.setZoom(newZoom);

                // Check if reached the final step
                if (stepCount >= steps) {
                    // Clear the interval
                    clearInterval(zoomInterval);
                }
            }

            // Call the gradualZoom function in intervals
            var zoomInterval = setInterval(gradualZoom, interval);
        }, function (error) {
            // Handle errors when getting user's location
            console.error('Error getting user location:', error);
        });
    } else {
        // If geolocation is not supported by the browser
        console.error('Geolocation is not supported by this browser.');
    }
}


// Call requestLocationAndZoom when the page is loaded
document.addEventListener("DOMContentLoaded", function () {
    requestLocationAndZoom();
});

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
        const groupedTournaments = {};

        // Get current timestamp
        const currentTime = new Date().getTime();

        data.forEach(tournament => {
            const { name, lat, lng, startAt, url } = tournament;

            // Check if lat and lng are valid numbers and not null
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);

            if (!isNaN(latNum) && !isNaN(lngNum) && lat !== null && lng !== null) {
                // Calculate time difference in milliseconds
                const timeDifference = startAt * 1000 - currentTime;

                // Determine if the tournament is within the next 7 days
                const withinNext7Days = timeDifference <= 7 * 24 * 60 * 60 * 1000;

                // Group tournaments with the same coordinates
                const key = `${latNum},${lngNum}`;
                if (!groupedTournaments[key]) {
                    groupedTournaments[key] = [];
                }

                // Push tournament to appropriate group based on time
                if (withinNext7Days) {
                    groupedTournaments[key].unshift(tournament); // Add to beginning to display on top of other pins
                } else {
                    groupedTournaments[key].push(tournament);
                }
            } else {
                console.error(`Invalid lat/lng values or null for tournament: ${name}`);
            }
        });

        // Display markers for each group of tournaments
        Object.values(groupedTournaments).forEach(tournaments => {
            const { lat, lng } = tournaments[0];
            const marker = L.marker([lat, lng]).addTo(map);

            // If there are multiple tournaments at the same location, create a popup showing all of them
            if (tournaments.length > 1) {
                let popupContent = '<ul>';
                tournaments.forEach(tournament => {
                    popupContent += `<li><b>${tournament.name}</b> - Starts at: ${new Date(tournament.startAt * 1000).toLocaleString()} - <a href="https://start.gg${tournament.url}" target="_blank">Sign Up Link</a></li>`;
                });
                popupContent += '</ul>';
                marker.bindPopup(popupContent);
            } else {
                // If there's only one tournament at the location, create a normal popup
                const { name, startAt, url } = tournaments[0];
                marker.bindPopup(`<b>${name}</b><br><b>Starts at:</b> ${new Date(startAt * 1000).toLocaleString()}<br><b>Sign Up Link:</b> <a href="https://start.gg${url}" target="_blank">https://start.gg${url}</a>`);
            }

            // Set marker icon color based on whether the tournament is within the next 7 days
            const iconColor = tournaments[0].startAt * 1000 - currentTime <= 7 * 24 * 60 * 60 * 1000 ? 'red' : 'blue';
            marker.setIcon(L.icon({
                iconUrl: `https://cdn.rawgit.com/pointhi/leaflet-color-markers/master/img/marker-icon-${iconColor}.png`,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            }));
        });
    } catch (error) {
        console.error(`Error displaying data: ${error.message}`);
    }
}

// Fetch video games data for search bar autocomplete
async function fetchVideoGames() {
    try {
        const response = await fetch(smashGGEndpoint);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();

        // Extract the list of video games from the response
        const videoGames = data.entities.videogame;

        // Map over the list of video games to extract id and name fields
        return videoGames.map(game => ({
            id: game.id,
            name: game.name
        }));
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
