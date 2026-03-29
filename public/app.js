// Get a reference to the database service
const root = firebase.database().ref();
const resultsRef = root.child("results");
const counterRef = root.child("counter");
const counterKey = "count";

var experimentApp = angular.module(
  'experimentApp', ['ngSanitize', 'preloader'],
  function($locationProvider) {
    $locationProvider.html5Mode({enabled: true, requireBase: false});
  }
);
var start_time;

experimentApp.controller('ExperimentController',
    function ExperimentController($scope, $timeout, $location, $interval, preloader) {
        $scope.user_id = Date.now();

        $scope.assignments = {};
        $scope.assignedCount = 0;
        $scope.img_url = [
            "images/KeyA.png",
            "images/KeyB.png",
        ];
        $scope.door_img_url = [
            "images/doorOne.png",
            "images/doorTwo.png"
        ];
        $scope.fruit_img_url = [
            "images/fruitOne.png",
            "images/fruitTwo.png",
            "images/fruitThree.png"
        ];
        $scope.key_img_url = [
            "images/KeyA.png",
            "images/KeyB.png"
        ];

        $scope.player_x = NaN;
        $scope.player_y = NaN;
        $scope.lastButton = NaN;

        $scope.instructions = [
            {
                text: "Test Instruction #1"
            }
        ];

        $scope.stimuli = [
            {
                "name": "01_1",
                "gridSize": [7, 7],
                "trays": [
                    { row: 0, col: 0 },
                    { row: 0, col: 2 },
                    { row: 3, col: 3 }
                ],
                "wallSquares": [
                    { row: 0, col: 4 },
                    { row: 2, col: 4 },
                    { row: 3, col: 4 },
                    { row: 4, col: 4 },
                    { row: 6, col: 4 },
                    { row: 3, col: 5 },
                    { row: 3, col: 6 },
                ],
                "doorSquares": [
                    { row: 1, col: 4 },
                    { row: 5, col: 4 }
                ],
                "fruit": [
                    { row: 0, col: 6 },
                    { row: 6, col: 6 }
                ],
                "keySquares": [
                    { row: 0, col: 0}
                ],
                "player": { row: 3, col: 1 },
                "ground_truth": ["Key A unlocks Door 1"]
            }
        ]

        $scope.active_stim = $scope.stimuli[0];

        // Initialize grid
        $scope.initializeGrid = function () {
            $scope.grid = document.getElementById('grid');
            $scope.grid.innerHTML = '';
      
            for (let row = 0; row < $scope.active_stim.gridSize[0]; row++) {
                for (let col = 0; col < $scope.active_stim.gridSize[1]; col++) {
                    $scope.cell = document.createElement('div');
                    $scope.cell.className = 'grid-cell';
                    $scope.cell.dataset.row = row;
                    $scope.cell.dataset.col = col;
              
                    // Check if this cell is a target square
                    $scope.isTarget = $scope.active_stim.trays.some(target => target.row === row && target.col === col);
                    if ($scope.isTarget) {
                        $scope.cell.classList.add('target');
                    }

                    // Check if this cell is a wall square
                    $scope.isWall = $scope.active_stim.wallSquares.some(wall => wall.row === row && wall.col === col);
                    if ($scope.isWall) {
                        $scope.cell.classList.add('wall');
                    }

                    // Check if this cell is a wall square
                    $scope.isDoor = $scope.active_stim.doorSquares.some(door => door.row === row && door.col === col);
                    if ($scope.isDoor) {
                        $scope.cell.classList.add('door');
                        $scope.active_stim.doorSquares.some((d, index) => {
                            if (d.row === row && d.col === col) {
                                $scope.png_id = $scope.door_img_url[index];
                                return;
                            }
                        });
                        $scope.blah = $scope.png_id;
                        $scope.cell.style.backgroundImage = `url('${$scope.png_id}')`;
                    }

                    // Check if this cell is a fruit
                    $scope.isFruit = $scope.active_stim.fruit.some(fruit => fruit.row === row && fruit.col === col);
                    if ($scope.isFruit) {
                        $scope.cell.classList.add('fruit');
                        $scope.active_stim.fruit.some((f, index) => {
                            if (f.row === row && f.col === col) {
                                $scope.png_id = $scope.fruit_img_url[index];
                                return;
                            }
                        });
                        $scope.cell.style.backgroundImage = `url('${$scope.png_id}')`;
                    }

                    $scope.isKey = $scope.active_stim.keySquares.some(key => key.row === row && key.col === col);
                    if ($scope.isKey) {
                        $scope.cell.classList.add('key-in-grid');
                        const keyIndex = $scope.active_stim.keySquares.findIndex(k => k.row === row && k.col === col);
                        $scope.cell.style.backgroundImage = `url('${$scope.key_img_url[keyIndex]}'), url('images/tray.png')`;
                    }

                    // Check if this cell is a player
                    $scope.isPlayer = $scope.active_stim.player.row === row && $scope.active_stim.player.col === col;
                    if ($scope.isPlayer) {
                        $scope.cell.classList.add('player');
                    }
              
                    // Add drop event listeners
                    $scope.cell.addEventListener('dragover', $scope.handleDragOver);
                    $scope.cell.addEventListener('drop', $scope.handleDrop);
                    $scope.cell.addEventListener('dragenter', $scope.handleDragEnter);
                    $scope.cell.addEventListener('dragleave', $scope.handleDragLeave);
                    $scope.cell.addEventListener('click', $scope.handleCellClick);
              
                    $scope.grid.appendChild($scope.cell);
                }
            }
            $scope.updateGridSize();
        }

        // Function to update grid CSS size
        $scope.updateGridSize = function () {
            $scope.gridContainer = document.getElementById('grid');
            if ($scope.gridContainer) {
                $scope.gridContainer.style.gridTemplateColumns = `repeat(${$scope.active_stim.gridSize[1]}, 1fr)`;
                $scope.gridContainer.style.gridTemplateRows = `repeat(${$scope.active_stim.gridSize[0]}, 1fr)`;
            }
        };

        $scope.initGridContainer = function () {
            $scope.active_stim = $scope.stimuli[0];

            $scope.player_x = $scope.active_stim.player.row;
            $scope.player_y = $scope.active_stim.player.col;

            $scope.initializeGrid();
        }
        
        document.addEventListener('keydown', (event) => {
            $scope.$apply(() => {
                $scope.lastButton = event.key;

                const r = $scope.active_stim.player.row;
                const c = $scope.active_stim.player.col;
                const maxRow = $scope.active_stim.gridSize[0] - 1;
                const maxCol = $scope.active_stim.gridSize[1] - 1;

                if (event.key === "ArrowUp" && r > 0 && $scope.isPassable(r - 1, c)) {
                    $scope.active_stim.player.row -= 1;
                } else if (event.key === "ArrowDown" && r < maxRow && $scope.isPassable(r + 1, c)) {
                    $scope.active_stim.player.row += 1;
                } else if (event.key === "ArrowLeft" && c > 0 && $scope.isPassable(r, c - 1)) {
                    $scope.active_stim.player.col -= 1;
                } else if (event.key === "ArrowRight" && c < maxCol && $scope.isPassable(r, c + 1)) {
                    $scope.active_stim.player.col += 1;
                }

                $scope.player_x = $scope.active_stim.player.row;
                $scope.player_y = $scope.active_stim.player.col;
            });
            $scope.initializeGrid();
        });

        $scope.isPassable = function(row, col) {
            const isWall = $scope.active_stim.wallSquares.some(w => w.row === row && w.col === col);
            const isDoor = $scope.active_stim.doorSquares.some(d => d.row === row && d.col === col);
            return !isWall && !isDoor;
        };

        //TODO: if in tray, person show, if key there take key, if have key can go through doors
        //TODO: integrate with actual game

        $scope.initGridContainer();

    }
)