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
var token = "c2a8a8f10786247a50b5be6cb87bc012";
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
                            numAttendees
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

const allMarkers = [];

// Function to display data on the map
async function displayData(gameId) {
    try {
        const data = await fetchData(gameId);
        const groupedTournaments = {};

                // Assume you already have a list of video games with their names and IDs
                const videoGames = await fetchVideoGames();
                const selectedGame = videoGames.find(game => game.id === gameId);
                const gameName = selectedGame ? selectedGame.name : 'Unknown Game';

        // Get current timestamp
        const currentTime = new Date().getTime();

        data.forEach(tournament => {
            const { name, lat, lng, startAt, url, numAttendees } = tournament;

            // Check if lat and lng are valid numbers and not null
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);

            if (!isNaN(latNum) && !isNaN(lngNum) && lat !== null && lng !== null) {
                // Calculate time difference in milliseconds
                const timeDifference = startAt * 1000 - currentTime;

                // Determine if the tournament is within the next 14 days
                const withinNext14Days = timeDifference <= 14 * 24 * 60 * 60 * 1000;

                // Group tournaments with the same coordinates
                const key = `${latNum},${lngNum}`;
                if (!groupedTournaments[key]) {
                    groupedTournaments[key] = {
                        tournaments: [],
                        withinNext14Days
                    };
                }

                // Push tournament to appropriate group based on time
                groupedTournaments[key].tournaments.push({
                    name,
                    lat: latNum,
                    lng: lngNum,
                    startAt,
                    url,
                    numAttendees
                });
            } else {
                console.error(`Invalid lat/lng values or null for tournament: ${name}`);
            }
        });

        // If no tournaments found, show a pop-up for 10 seconds
        if (Object.keys(groupedTournaments).length === 0) {
            const popup = L.popup()
                .setLatLng(map.getCenter())
                .setContent("No Tournaments Found")
                .openOn(map);
        
            setTimeout(function () {
                map.closePopup(popup);
            }, 10000); // Close popup after 10 seconds
        }


        // Display markers for each group of tournaments
        Object.values(groupedTournaments).forEach(group => {
            const { tournaments, withinNext14Days } = group;

            // Calculate the average coordinates for grouping
            let totalLat = 0;
            let totalLng = 0;
            tournaments.forEach(tournament => {
                totalLat += tournament.lat;
                totalLng += tournament.lng;
            });
            const avgLat = totalLat / tournaments.length;
            const avgLng = totalLng / tournaments.length;

            // Determine the icon color based on the tournament category
            let iconColor;
            const numAttendeesGroup = tournaments.reduce((acc, curr) => acc + curr.numAttendees, 0);
            if (tournaments.some(tournament => ["evo japan 2024", "evo 2024"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'gold'; // Master + Gold
            } else if (tournaments.some(tournament => ["paradise game battle 2024", "combo breaker 2024", "battle arena melbourne 2024", "tgu 2024", "punishment 2", "the mixup 2024", "ceo 2024", "atl super tournament 2024", "vsfighting xii", "emirates showdown 2024"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'gold'; // Master
            } else if (tournaments.some(tournament => ["electric clash 2024", "only the best 2024", "ufa 2024", "3f - fight for the future", "second wind 2024", "thunderstruck 2024", "brussels challenge 2024", "fv major 2024", "clash of the olympians 2024", "dreamhack dallas 2024", "crossover 2024", "cape town showdown 2024", "hado fight festival", "moor1ng"].some(keyword => tournament.name.toLowerCase().includes(keyword.toLowerCase())))) {
                iconColor = 'grey'; // Challenger
            } else  if (withinNext14Days) {
                    if (numAttendeesGroup >= 96) {
                        iconColor = 'black'; // 96 attendees Black
                    } else if (numAttendeesGroup >= 64) {
                        iconColor = 'violet'; // 64 attendees Violet
                    } else if (numAttendeesGroup >= 48) {
                        iconColor = 'red'; // 48 attendees Red
                    } else if (numAttendeesGroup >= 32) {
                        iconColor = 'orange'; // 32 attendees Orange
                    } else if (numAttendeesGroup >= 24) {
                        iconColor = 'yellow'; // 24 attendees Yellow
                    } else if (numAttendeesGroup >= 16) {
                        iconColor = 'green'; // 16 attendees Green
                    } else {
                        iconColor = 'white'; // Under attendees 16 White
                    }
                } else {
                    iconColor = 'blue'; // Over 2 weeks away Blue
                }

            const marker = L.marker([avgLat, avgLng]).addTo(map);
            allMarkers.push(marker);

// Assuming 'gameName' is included in the tournament data from autofill
// If there are multiple tournaments at the same location, create a popup showing all of them
if (tournaments.length > 1) {
    let popupContent = '<ul>';
    tournaments.forEach(tournament => {
        // Access the game name from the tournament or autofill data
        const gameName = tournament.gameName || 'Unknown Game'; // Adjust based on how gameName is stored
        popupContent += `<li><b>${tournament.name}</b><br>Starts at: ${new Date(tournament.startAt * 1000).toLocaleString()}<br><a href="https://start.gg${tournament.url}" target="_blank">Sign Up Link</a><br>Attendees: ${tournament.numAttendees}</li>`;
    });
    popupContent += '</ul>';
    marker.bindPopup(popupContent);
} else {
    // If there's only one tournament at the location, create a normal popup
    const { name, startAt, url, numAttendees, gameName } = tournaments[0];
    marker.bindPopup(`<b>${name}</b><br>Starts at: ${new Date(startAt * 1000).toLocaleString()}UTC<br><a href="https://start.gg${url}" target="_blank">Sign Up Link</a><br>Attendees: ${numAttendees}`);
}


            // Set marker icon color
            marker.setIcon(L.icon({
                iconUrl: `custom pin/marker-icon-${iconColor}.png`,
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            }));
        });

// Create a custom control for legend
const legendControl = L.control({ position: 'topright' });

// Implement the onAdd method for the control
legendControl.onAdd = function(map) {
    // Create a container div for the legend
    const container = L.DomUtil.create('div', 'legend-container');

    // Add HTML content for the legend
    container.innerHTML = `
        <div class="legend">
            <button class="toggle-legend">Filter</button>
            <div class="legend-content" style="display: none; background-color: white; padding: 10px;">
                <h4>Filter</h4>
                <div class="legend-buttons">
                    <button class="select-all">Select All</button>
                    <button class="deselect-all">Deselect All</button>
                </div>
                <ul>
                    <li>
                        <input type="checkbox" id="checkbox-gold" class="pin-checkbox" checked>
                        <label for="checkbox-gold"><img class="legend-icon" src="custom pin/marker-icon-gold.png"> Master +, Master</label>
                    </li>
                    <li>
                        <input type="checkbox" id="checkbox-grey" class="pin-checkbox" checked>
                        <label for="checkbox-grey"><img class="legend-icon" src="custom pin/marker-icon-grey.png"> Challenger</label>
                    </li>
                    <li>
                        <input type="checkbox" id="checkbox-black" class="pin-checkbox" checked>
                        <label for="checkbox-black"><img class="legend-icon" src="custom pin/marker-icon-black.png"> 96+ attendees</label>
                    </li>
                    <li>
                        <input type="checkbox" id="checkbox-violet" class="pin-checkbox" checked>
                        <label for="checkbox-violet"><img class="legend-icon" src="custom pin/marker-icon-violet.png"> 64+ attendees</label>
                    </li>
                    <li>
                        <input type="checkbox" id="checkbox-red" class="pin-checkbox" checked>
                        <label for="checkbox-red"><img class="legend-icon" src="custom pin/marker-icon-red.png"> 48+ attendees</label>
                    </li>
                    <li>
                        <input type="checkbox" id="checkbox-orange" class="pin-checkbox" checked>
                        <label for="checkbox-orange"><img class="legend-icon" src="custom pin/marker-icon-orange.png"> 32+ attendees</label>
                    </li>
                    <li>
                        <input type="checkbox" id="checkbox-yellow" class="pin-checkbox" checked>
                        <label for="checkbox-yellow"><img class="legend-icon" src="custom pin/marker-icon-yellow.png"> 24+ attendees</label>
                    </li>
                    <li>
                        <input type="checkbox" id="checkbox-green" class="pin-checkbox" checked>
                        <label for="checkbox-green"><img class="legend-icon" src="custom pin/marker-icon-green.png"> 16+ attendees</label>
                    </li>
                    <li>
                        <input type="checkbox" id="checkbox-white" class="pin-checkbox" checked>
                        <label for="checkbox-white"><img class="legend-icon" src="custom pin/marker-icon-white.png"> Under attendees 16</label>
                    </li>
                    <li>
                        <input type="checkbox" id="checkbox-blue" class="pin-checkbox" checked>
                        <label for="checkbox-blue"><img class="legend-icon" src="custom pin/marker-icon-blue.png"> Over 2 weeks away</label>
                    </li>
                </ul>
            </div>
        </div>
    `;

    // Toggle legend visibility when button is clicked
    const toggleButton = container.querySelector('.toggle-legend');
    const legendContent = container.querySelector('.legend-content');
    toggleButton.addEventListener('click', function() {
        if (legendContent.style.display === 'none') {
            legendContent.style.display = 'block';
        } else {
            legendContent.style.display = 'none';
        }
    });

    // Select All button functionality
    const selectAllButton = container.querySelector('.select-all');
    selectAllButton.addEventListener('click', function() {
        const checkboxes = container.querySelectorAll('.pin-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = true;
            const iconColor = checkbox.id.replace('checkbox-', '');
            filterMarkers(iconColor, true);
        });
    });

    // Deselect All button functionality
    const deselectAllButton = container.querySelector('.deselect-all');
    deselectAllButton.addEventListener('click', function() {
        const checkboxes = container.querySelectorAll('.pin-checkbox');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
            const iconColor = checkbox.id.replace('checkbox-', '');
            filterMarkers(iconColor, false);
        });
    });

    // Add event listeners to the checkboxes
    const checkboxes = container.querySelectorAll('.pin-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function() {
            const iconColor = this.id.replace('checkbox-', '');
            const checked = this.checked;
            filterMarkers(iconColor, checked);
        });
    });

    return container;
};

// Function to filter markers based on pin type
function filterMarkers(pinType, show) {
    allMarkers.forEach(marker => {
        const icon = marker.options.icon;
        if (icon.options.iconUrl.includes(pinType)) {
            if (show && !map.hasLayer(marker)) {
                // Add the marker to the map if it matches the pinType and is not already visible
                map.addLayer(marker);
            } else if (!show && map.hasLayer(marker)) {
                // Remove the marker from the map if it matches the pinType and is visible
                map.removeLayer(marker);
            }
        }
    });
}

// Make the control invisible
document.querySelector('.legend-container').style.display = 'none';

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

async function autocompleteSearch() {
    try {
        const videoGames = await fetchVideoGames();
        const input = document.getElementById('game-search');
        const selectedGames = new Set(); // Use a Set to store selected game IDs

        // Initialize Awesomplete autocomplete
        new Awesomplete(input, {
            list: videoGames.map(game => game.name),
            autoFirst: true,
            filter: Awesomplete.FILTER_STARTSWITH
        });

        input.addEventListener('awesomplete-selectcomplete', function(event) {
            const selectedGameName = event.text.value;
            const game = videoGames.find(g => g.name === selectedGameName);
            if (game) {
                selectedGames.add(game.id);
                updateSelectedGamesDisplay(videoGames, selectedGames);
            }
        });

    } catch (error) {
        console.error('Error in autocompleteSearch:', error);
    }
}

// Define selectedGames globally or within a module scope
let selectedGames = new Set(); // or let selectedGames = []; if using an Array

// Function to clear selected games and refresh the page
function clearSelectedGames() {
    // Refresh the page to reset all state
    location.reload();
}

// Function to update the display of selected games
function updateSelectedGamesDisplay(videoGames, selectedGames) {
    const display = document.getElementById('selected-games-display');

    // Get the count of selected games
    const selectedGamesCount = selectedGames instanceof Set ? selectedGames.size : selectedGames.length;

    // Update the display to show "X Games Selected"
    display.textContent = `${selectedGamesCount} ${selectedGamesCount === 1 ? 'Game' : 'Games'} Selected`;

    // Update the hidden input field with the selected game IDs
    document.getElementById('selected-games').value = Array.from(selectedGames).join(',');
}

// Example function for adding a game (for context)
function addGame(gameID) {
    if (selectedGames instanceof Set) {
        selectedGames.add(gameID); // Add to the Set
    } else {
        console.error('selectedGames is not a Set');
    }

    // Update display after adding a game
    updateSelectedGamesDisplay([], selectedGames);
}

// Function to clear all existing markers and filters from the map
function clearExistingFiltersAndMarkers() {
    // Remove all markers from the map
    map.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            map.removeLayer(layer);
        }
    });

    // Remove the legend container if it exists
    const legendContainer = document.querySelector('.legend-container');
    if (legendContainer) {
        legendContainer.remove();
    }
}

async function search() {
    const selectedGameIds = document.getElementById('selected-games').value.split(',').filter(id => id.trim() !== '');
    
    // Hide legend when starting a new search
    hideLegend();
    
    // Show loading spinner
    document.getElementById('map-loading-spinner').style.display = 'block';

    // Clear existing filters and markers
    clearExistingFiltersAndMarkers();

    if (selectedGameIds.length > 0) {
        // Fetch and display data for each selected game
        for (const gameId of selectedGameIds) {
            await displayData(gameId);
        }
    } else {
        // If no game is selected, display a pop-up or a default message
        const popup = L.popup()
            .setLatLng(map.getCenter())
            .setContent("No Games Selected")
            .openOn(map);
        
        setTimeout(function () {
            map.closePopup(popup);
        }, 5000); // Close popup after 5 seconds

        // Clear search input and show legend when input is empty
        document.getElementById('game-search').value = '';
        showLegend();
    }

    // Hide loading spinner after data is displayed
    document.getElementById('map-loading-spinner').style.display = 'none';
}

// Function to hide the legend
function hideLegend() {
    const legendContainer = document.querySelector('.legend-container');
    if (legendContainer) {
        legendContainer.style.display = 'none';
    }
}

// Function to show the legend
function showLegend() {
    const legendContainer = document.querySelector('.legend-container');
    if (legendContainer) {
        legendContainer.style.display = 'block';
    }
}

// Function to select or deselect all checkboxes
function toggleAllCheckboxes(checked) {
    const checkboxes = document.querySelectorAll('.pin-checkbox');
    checkboxes.forEach(checkbox => {
        checkbox.checked = checked;
        const iconColor = checkbox.id.replace('checkbox-', '');
        filterMarkers(iconColor, checked);
    });
}

// Add "Select All" and "Deselect All" buttons to the legend
const selectAllButton = document.createElement('button');
selectAllButton.textContent = 'Select All';
selectAllButton.classList.add('legend-button');
selectAllButton.addEventListener('click', function() {
    toggleAllCheckboxes(true);
});

const deselectAllButton = document.createElement('button');
deselectAllButton.textContent = 'Deselect All';
deselectAllButton.classList.add('legend-button');
deselectAllButton.addEventListener('click', function() {
    toggleAllCheckboxes(false);
});

// Add buttons to legend container
const legendContainer = document.querySelector('.legend-container');
if (legendContainer) {
    legendContainer.appendChild(selectAllButton);
    legendContainer.appendChild(deselectAllButton);
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

// Function to set up autocomplete search
async function autocompleteSearch() {
    try {
        const videoGames = await fetchVideoGames();
        const input = document.getElementById('game-search');
        const selectedGames = new Set(); // Use a Set to store selected game IDs

        // Initialize Awesomplete autocomplete
        new Awesomplete(input, {
            list: videoGames.map(game => game.name),
            autoFirst: true,
            filter: Awesomplete.FILTER_STARTSWITH
        });

        input.addEventListener('awesomplete-selectcomplete', function(event) {
            const selectedGameName = event.text.value;
            const game = videoGames.find(g => g.name === selectedGameName);
            if (game) {
                selectedGames.add(game.id);
                updateSelectedGamesDisplay(videoGames, selectedGames);
            }
        });

        // Initialize display with empty set
        updateSelectedGamesDisplay(videoGames, selectedGames);

    } catch (error) {
        console.error(`Error setting up autocomplete: ${error.message}`);
    }
}

// Call the function to set up autocomplete
autocompleteSearch();