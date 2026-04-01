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

    $scope.section = "instructions";
    $scope.inst_id = 0;
    $scope.stim_id = 0;
    $scope.part_id = -1;

    $scope.valid_comprehension = false;
    $scope.comprehension_response = "";

    $scope.response = {
      "beliefs": [NaN, NaN],
      "belief_ids": [1, 2]
    };

    $scope.valid_belief = false;

    $scope.valid_exam = false;
    $scope.exam_score = 0;
    $scope.exam_results = [];
    $scope.exam_done = false;
    $scope.last_exam_correct = false;
    $scope.last_exam_response = "";

    $scope.show_rhs = true;

    $scope.belief_statements = [];
    $scope.belief_statement_ids = [];
    $scope.belief_statement_counts = [];
    $scope.n_displayed_statements = 4;

    $scope.ratings = [];

    $scope.replaying = false;
    $scope.replay_id = 0;

    $scope.user_count = 0;

    $scope.total_reward = 0;
    $scope.total_payment = 0;
    $scope.stim_reward = 0;

    $scope.button_disabled = false;
    $scope.countdown_time = 0;
    $scope.timer_active = false;
    $scope.qSeries = ["a", "b", "c"];

    $scope.data = {
      "user_id": NaN,
      "total_payment": 0,
      "total_reward": 0,
      "exam": NaN,
      "demographic_survey": NaN,
      "stimuli_set": {}
    }
        
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

    $scope.inventory = [];
    $scope.endMap = false;

    $scope.log = function (...args) {
      if ($location.search().debug == "true") {
        console.log(...args);
      }
    }

    $scope.store_to_db = function (key, val) {
      resultsRef.child(key).set(val);
    }

    $scope.get_counter = async function () {
      return counterRef.child(counterKey).once("value", function (snapshot) {
        $scope.user_count = snapshot.val();
      }).then(() => { return $scope.user_count; });
    }
    
    $scope.increment_counter = function () {
      counterRef.child(counterKey).transaction(function (currentValue) {
        return (currentValue || 0) + 1;
      });
    }

    $scope.get_statement_counts = async function (stim_id) {
      let cur_stim = $scope.stimuli_set[stim_id];
      let n = cur_stim.statements.length;
      if ($location.search().local == "true") {
        $scope.belief_statement_counts = Array(n).fill(0);
        return $scope.belief_statement_counts;
      } else {
        let key = "statement_counts/" + cur_stim.name;
        return counterRef.child(key).once("value", function (snapshot) {
          let data = snapshot.val();
          if (!data) {
            $scope.belief_statement_counts = Array(n).fill(0);
          } else {
            $scope.belief_statement_counts = data;
          }
        }).then(() => { return $scope.belief_statement_counts; });
      }
    }
    
    $scope.set_statement_counts = function (stim_id, counts) {
      if ($location.search().local == "true") {
        return;
      } else {
        let cur_stim = $scope.stimuli_set[stim_id];
        let key = "statement_counts/" + cur_stim.name;
        counterRef.child(key).set(counts);
      }
    }

    $scope.validate_answer = function (ans) {
      $scope.comprehension_response = ans;
      let index = $scope.instructions[$scope.inst_id].answer;
      $scope.valid_comprehension = ans == $scope.instructions[$scope.inst_id].options[index];
    }

    $scope.validate_belief = function () {
      $scope.valid_belief = $scope.response.beliefs.every(rating =>
        !isNaN(rating) && rating >= 1 && rating <= 100
      );
    }

    $scope.validate_exam = function (ans) {
      $scope.exam_response = ans;
      $scope.valid_exam = true;
    }
        
    $scope.advance = async function () {
      if ($scope.section == "instructions") {
        await $scope.advance_instructions()
      } else if ($scope.section == "stimuli") {
        await $scope.advance_stimuli()
      } else if ($scope.section == "endscreen") {
        $scope.end_id += 1;
        if ($scope.end_id == 2) {
          $scope.age_q = document.getElementById("age");
          $scope.gender_q = document.getElementById("gender");
          $scope.ethnicity_q = document.getElementById("ethnicity");
          $scope.id_q = document.getElementById("mturkID");
          $scope.feedback_q = document.getElementById("feedback");

          $scope.survey = {
            age: $scope.age_q.value,
            gender: $scope.gender_q.value,
            ethnicity: $scope.ethnicity_q.value,
            mturk_id: $scope.id_q.value,
            feedback: $scope.feedback_q.value
          }
          $scope.data.demographic_survey = $scope.survey;
          $scope.store_to_db($scope.user_id, $scope.data);
        }
      }
    };
    
    $scope.advance_instructions = async function () {
      if ($scope.inst_id == $scope.instructions.length - 1) {
        // Initialize stimuli section
        $scope.section = "stimuli";
        $scope.stim_id = 0;
        $scope.part_id = 1;
        $scope.ratings = [];
        $scope.active_stim = $scope.stimuli_set[0];
        $scope.inventory = [];
        $scope.initializeGridWhenReady();

        // Get time of first stimulus
        if (start_time == undefined) {
          start_time = (new Date()).getTime();
        }
      } else if ($scope.instructions[$scope.inst_id].exam_end) {
        // Store exam results for initial attempt
        if (!$scope.exam_done) {
          let exam_data = {
            "results": $scope.exam_results,
            "score": $scope.exam_score
          }
          $scope.log("Exam Results: " + exam_data.results);
          $scope.log("Exam Score: " + exam_data.score);
          $scope.data.exam = exam_data;
          $scope.exam_done = true;
        }
        // Loop back to start of exam if not all questions are correct
        if ($scope.exam_score < $scope.exam_results.length) {
          $scope.inst_id = $scope.instructions[$scope.inst_id].exam_start_id;
        } else {
          $scope.inst_id = $scope.inst_id + 1;
        }
        $scope.exam_results = [];
        $scope.exam_score = 0;
      } else {
        // Score exam question
        if ($scope.instructions[$scope.inst_id].exam) {
          let ans = $scope.instructions[$scope.inst_id].options[$scope.instructions[$scope.inst_id].answer];
          let correct = ans === $scope.exam_response;
          $scope.exam_results.push(correct);
          $scope.exam_score = $scope.exam_results.filter(correct => correct == true).length
          $scope.last_exam_correct = correct;
          $scope.last_exam_response = $scope.exam_response;
        }
        // Increment instruction counter
        $scope.inst_id = $scope.inst_id + 1;
        if ($scope.inst_id >= $scope.instructions.length) {
          $scope.section = "stimuli";
          $scope.stim_id = 0;
          $scope.part_id = 1;
          $scope.ratings = [];
          if ($scope.stimuli_set.length === 0) {
              // stimuli not loaded yet, wait and retry
              $timeout(function() { $scope.advance_instructions(); }, 100);
              return;
          }
          $scope.active_stim = $scope.stimuli_set[0];
          $scope.inventory = [];
          $scope.initializeGridWhenReady();
          return;
        }
        // Delay RHS display
        if ($scope.instructions[$scope.inst_id].delay > 0) {
          $scope.show_rhs = false;
          $timeout(function () { $scope.show_rhs = true; },
            $scope.instructions[$scope.inst_id].delay);
        }
        // Set new belief statements
        if ($scope.has_belief_question()) {
          $scope.belief_statements = $scope.instructions[$scope.inst_id].statements;
          let n = $scope.belief_statements.length;
          $scope.belief_statement_ids = Array.from(Array(n).keys());
        }
      }

      //   $scope.div = document.getElementById('ground_truth')
      //   if ($scope.inst_id == 4 || $scope.inst_id == 7) {
      //       $scope.div.innerHTML = "";
      //       $scope.div.innerHTML += "<u>Here are the types of liquid in each flask:</u>" + "<br><br>";
      //       $scope.instructions[$scope.inst_id].ground_truth.forEach((element) => {
      //           $scope.div.innerHTML += element + "<br>";
      //       });
      //   }

      if ($scope.section == 'instructions' && $scope.instructions[$scope.inst_id] && $scope.instructions[$scope.inst_id].tutorial) {
        const stimIndex = $scope.instructions[$scope.inst_id].tutorialStim;
        $scope.active_stim = $scope.tutorial_stimuli[stimIndex];
        $scope.inventory = [];
        $scope.initializeGridWhenReady();
      }
      
      $scope.comprehension_response = "";
      $scope.valid_comprehension = false;
      $scope.exam_response = "";
      $scope.valid_exam = false;
    };
        
    $scope.advance_stimuli = async function () {
      if ($scope.stim_id == $scope.stimuli_set.length) {
        // Advance to endscreen
        $scope.section = "endscreen"
        $scope.end_id = 0;
        $scope.total_payment = ($scope.total_reward > 0) ? Math.round($scope.total_reward / 10) / 100 : 0;
        $scope.data.total_payment = $scope.total_payment;
        $scope.data.total_reward = $scope.total_reward;
      } else if ($scope.part_id < 0) {
        // Advance to first part
        $scope.part_id = 1;
        $scope.ratings = [];
        start_time = (new Date()).getTime();
      } else if ($scope.part_id == 1) {
        // Done with grid, go to ground truth
        $scope.part_id = 2;
      } else if ($scope.part_id == 2) {
        // Done with ground truth, advance to next map
        $scope.data.stimuli_set[$scope.stimuli_set[$scope.stim_id].name] = $scope.ratings;
        $scope.stim_id = $scope.stim_id + 1;
        if ($scope.stim_id < $scope.stimuli_set.length) {
          $scope.active_stim = $scope.stimuli_set[$scope.stim_id];
          $scope.inventory = [];
          $scope.part_id = 1;
          $scope.initializeGridWhenReady();
        } else {
          $scope.part_id = -1;
        }
      }
    };

    $scope.compute_ratings = function (response) {
      rating = {
        "time_spent": ((new Date()).getTime() - start_time) / 1000.,
      }

      response.beliefs.forEach((act_rating, index) => {
        rating[$scope.belief_statement_ids[index]] = act_rating;
      });

      return rating;
    };

    $scope.style_statement = function (stmt) {
      return stmt
    }

    $scope.instruction_has_text = function () {
      return $scope.instructions[$scope.inst_id].text != null
    };
    $scope.instruction_has_image = function () {
      return $scope.instructions[$scope.inst_id].image != null
    };
    $scope.instruction_has_question = function () {
      return $scope.instructions[$scope.inst_id].question != null
    };
    $scope.is_exam = function () {
      return $scope.instructions[$scope.inst_id].exam == true
    };
    $scope.is_feedback = function () {
      return $scope.instructions[$scope.inst_id].feedback == true
    };
    $scope.is_exam_end = function () {
      return $scope.instructions[$scope.inst_id].exam_end == true
    };
    $scope.is_tutorial = function () {
      return $scope.instructions[$scope.inst_id].tutorial == true
    };
    $scope.hide_questions = function () {
      if ($scope.section == "stimuli") {
        return $scope.part_id < 0
      } else if ($scope.section == "instructions") {
        return $scope.instructions[$scope.inst_id].show_questions == false
      }
      return true
    };

    $scope.has_belief_question = function () {
      if ($scope.section == "stimuli") {
        return $scope.part_id > 0
      } else if ($scope.section == "instructions") {
        return ($scope.instructions[$scope.inst_id].question_types != null &&
          $scope.instructions[$scope.inst_id].question_types.includes("beliefs"))
      }
      return false
    };

    $scope.array_equals = function (a, b) {
      return Array.isArray(a) &&
        Array.isArray(b) &&
        a.length === b.length &&
        a.every((val, index) => val === b[index]);
    }

    $scope.array_shuffle = function (arr) {
      return arr.map(a => [a, Math.random()])
        .sort((a, b) => { return a[1] < b[1] ? -1 : 1; }).map(a => a[0]);
    }

    $scope.array_sample = function (arr, n) {
      return arr.slice(0, n);
    }

    $scope.stimuli_set = [];
    $scope.set_stimuli = async function () {
      // Uncomment for testing stimuli
      let stim_idx = [];
      let count = await $scope.get_counter();
      $scope.increment_counter();
      stim_idx = $scope.stimuli_sets[count % $scope.stimuli_sets.length];
      $scope.blah = stim_idx

      $scope.log("stimuli idx = ", stim_idx);
      for (i = 0; i < stim_idx.length; i++) {
        $scope.stimuli_set.push($scope.stimuli[stim_idx[i]]);
      }
      $scope.stimuli_set = $scope.array_shuffle($scope.stimuli_set);
      $scope.log("stimuli ", $scope.stimuli_set);

      // Store stimuli set and user ID
      $scope.data.user_id = $scope.user_id;
    };
        
    $scope.stimuli_sets = [
      //   [0, 4, 8, 9, 13, 14, 15, 19, 23, 25],
      //   [1, 5, 6, 11, 16, 20, 21, 26, 28, 29],
      //   [2, 3, 7, 10, 12, 17, 18, 22, 24, 27]
      [0, 1, 2, 3]
    ]

    $scope.instructions = [
      {
        text: `Welcome to the Doors and Keys game!
              <br><br>
              Before you begin your task, you'll complete a brief guided tutorial (~ 2 minutes) to understand the game.
              <br><br>
              Press <strong>Next</strong> to continue.`,
        show_questions: false
      },
      {
        text: `You're watching someone play a treasure game shown to the left.
              <br><br>
              There is one Adventurer <img class="caption-image" src="images/human.png"> whose goal is to collect one of the fruits <img class="caption-image" src="images/fruitOne.png"> and <img class="caption-image" src="images/fruitTwo.png">.
              The player can only get exactly one fruit. The black tiles represent walls which cannot be passed through.
              The fruits may be locked behind doors <img class="caption-image" src="images/door.png">, which can only be unlocked with a specific key <img class="caption-image" src="images/key.png">.
              The keys can only be placed in purple trays <img class="caption-image" src="images/tray.png">.
              <br> <br>
              The doors and keys are all unique and labeled. A door can only be unlocked by a particular key.
              <br> <br>
              The adventurer does not know which keys unlock which doors. To help the adventurer more efficiently reach their goal, <strong>the game designer</strong>,
              who knows which keys unlock which doors, <strong>has arranged the keys strategically amoungst the purple trays.</strong>
              <br> <br>
              In this experiment, you are playing the role of the Adventurer.
              We will show you the map after the game designer has rearranged the keys, and ask you to match which key(s) corresponds to what door(s).
              Keys have the potential to unlock one or multiple doors but can only be used once for each chamber map.
              <br> <br>

              Press the <strong>Next</strong> button to continue.
              `,
        show_questions: false
      },
      {
        text: `At each trial, we will show you the key placement and ask you questions about the <strong>which</strong> door each key unlocks.<br>
              <br>
              Rate <strong>100</strong> if you're <strong>certain</strong> that the key <strong>unlocks</strong> a <strong>door</strong>.<br>
              Rate <strong>50</strong> if you think there's an <strong>even, 50-50 chance</strong> whether the does or does not <strong>unlock</strong> a <strong>door</strong>.<br>
              Rate <strong>0</strong> if you're <strong>certain</strong> that the key <strong>does not unlock</strong> a <strong>door</strong>.<br>
              <br>
              Press <strong>Next</strong> to watch what happens.
              `,
        show_questions: false
      },
      {
        text: `<br>`
        ,
        tutorial: true,
        tutorialStim: 0,
        show_questions: true,
        question_types: ["beliefs"],
        statements: [["<strong>Key A</strong> unlocks <strong>Door 1</strong>"]]
      },
      {
        text: "In this case, Key A unlocks Door 1. This is because the room designer chose to place Key A close to Door 1 when they had a choice of placing it farther.",
        tutorialStim: 0
      },
      {
        text: `Now look at this map which has been slightly altered from the previous one. Think about how moving the Key to a different tray changed your judgment.
        <br><br><br>
        Press <strong>Next</strong> to continue.`,
        tutorial: true,
        tutorialStim: 1
      },
      {
        text: `<br>`,
        tutorial: true,
        tutorialStim: 1,
        show_questions: true,
        question_types: ["beliefs"],
        statements: [["<strong>Key A</strong> unlocks <strong>Door 1</strong>"]]
      },
      {
        text: "In this case Key A unlocks Nothing! The room designer intentionally placed Key A far away from the agent to indicate it did not unlock the door."
      },
      {
        text: `As mentioned, you should assume that the room designer wants you to succeed as both of you will benefit if you answer correctly. The reward scheme is as follows:

              <br><br>
              For each question, Your rating will be compared to the answer key and rewards will be calibrated by considering the difference.

              <br><br>

              If the key does not unlock a door and you answer 100, you receive -50 points. If you answer 0, you receive 50 points. If you answer 50, you receive 0 points.
              <br><br>
              Similarly, if the key unlocks a door and you answer 100, you receive 50 points. If you answer 0, you receive -50 points. If you answer 50, you receive 0 points.

              <br><br>
              You accumulate the points you receive over all the maps you play and will be paid a bonus at the end of the experiment, at a rate of 1 USD per 1000 points.
              `
      },
      {
        text: `You've now finished the practice round and the Adventurer can search for fruits using the keys you've collected!`
      },
      {
        text: `<strong>Comprehension Questions</strong> <br>
               <br>
               For the last part of the tutorial, we will ask 5 quick questions to check your understanding of the task.<br>
               <br>
               Answer <strong>all questions correctly</strong> in order to proceed to the main experiment.
               You can retake the quiz as many times as necessary.
              `
      },
      {
        text: `<strong>Question 1/5:</strong> How many keys are needed to unlock a door?`,
        options: ["1",
          "2",
          "Depends on the door"],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 1/5:</strong> How many keys are needed to unlock a door?`,
        options: ["1",
          "2",
          "Depends on the door"],
        answer: 0,
        feedback: true
      },
      {
        text: `<strong>Question 2/5:</strong> Which of the following statements is true?`,
        options: ["A key can be used to unlock any door",
          "A key can only be used to unlock a specific door",
          "A key can be used to unlock many doors"],
        answer: 1,
        exam: true
      },
      {
        text: `<strong>Question 2/5:</strong> Which of the following statements is true?`,
        options: ["A key can be used to unlock any door",
          "A key can only be used to unlock a specific door",
          "A key can be used to unlock many doors"],
        answer: 1,
        feedback: true
      },
      {
        text: `<strong>Question 3/5:</strong> Which of the following statements is true?`,
        options: ["The room designer placed the flasks randomly.",
          "The room designer placed the keys in trays close to doors they can unlock.",
          "The room designer placed the keys strategically amoung the key trays to help the player"],
        answer: 2,
        exam: true
      },
      {
        text: `<strong>Question 3/5:</strong> Which of the following statements is true?`,
        options: ["The room designer placed the flasks randomly.",
          "The room designer placed the keys in trays close to doors they can unlock.",
          "The room designer placed the keys strategically amoung the key trays to help the player"],
        answer: 2,
        feedback: true
      },
      {
        text: `<strong>Question 4/5:</strong> Where can the room designer place the keys?`,
        options: ["Anywhere on the map.",
          "ONLY on the trays.",
          "ONLY next to a wall, the Adventurer, or the fruit."],
        answer: 1,
        exam: true
      },
      {
        text: `<strong>Question 4/5:</strong> Where can the room designer place the keys?`,
        options: ["Anywhere on the map.",
          "ONLY on the trays.",
          "ONLY next to a wall, the Adventurer, or the fruit."],
        answer: 1,
        feedback: true
      },
      {
        text: `<strong>Question 5/5:</strong> If the map has one key and there is only one tray and two doors, what conclusion can you draw?`,
        options: ["The key must unlock one of the two doors",
          "The key must unlock the closest door",
          "The key can unlock both of them"],
        answer: 0,
        exam: true
      },
      {
        text: `<strong>Question 5/5:</strong> If the map has one key and there is only one tray and two doors, what conclusion can you draw?`,
        options: ["The key must unlock one of the two doors",
          "The key must unlock the closest door",
          "The key can unlock both of them"],
        answer: 0,
        feedback: true
      },
      {
        exam_end: true,
        exam_start_id: 11
      },
      {
        text: `Congratulations! You've finished the tutorial.
               <br><br>
               You will now play the game for 10 different rounds.
               <br><br>
               Ready to start? Press <strong>Next</strong> to continue!`
      }
    ];

    if ($location.search().skip_tutorial == "true") {
      $scope.inst_id = $scope.instructions.length - 1;
    }
        
    $scope.tutorial_stimuli = [
      {
        "name": "tutorial1",
        "gridSize": [3, 8],
        "trays": [
          { row: 0, col: 5 }
        ],
        "wallSquares": [
          { row: 0, col: 6 },
          { row: 1, col: 6 },
        ],
        "doorSquares": [
          { row: 1, col: 7, unlockedBy: 0 }
        ],
        "fruit": [
          { row: 0, col: 7, fruitId: 0 }
        ],
        "keySquares": [
          { row: 0, col: 5, keyId: 0 }
        ],
        "player": { row: 0, col: 0 }
      },
      {
        "name": "tutorial2",
        "gridSize": [3, 8],
        "trays": [
          { row: 2, col: 0 },
          { row: 0, col: 5 }
        ],
        "wallSquares": [
          { row: 0, col: 6 },
          { row: 1, col: 6 }
        ],
        "doorSquares": [
          { row: 1, col: 7, unlockedBy: 0 }
        ],
        "fruit": [
          { row: 0, col: 7, fruitId: 0 }
        ],
        "keySquares": [
          { row: 2, col: 0, keyId: 0 }
        ],
        "player": { row: 0, col: 0 }
      }
    ]

    //TODO: put in all of the stimuli
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
          { row: 1, col: 4, unlockedBy: 0 },
          { row: 5, col: 4 }
        ],
        "fruit": [
          { row: 0, col: 6, fruitId: 0 },
          { row: 6, col: 6, fruitId: 1 }
        ],
        "keySquares": [
          { row: 0, col: 2, keyId: 0 }
        ],
        "player": { row: 3, col: 1 }
      },
      {
        "name": "01_2",
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
          { row: 5, col: 4, unlockedBy: 0 }
        ],
        "fruit": [
          { row: 0, col: 6, fruitId: 0 },
          { row: 6, col: 6, fruitId: 1 }
        ],
        "keySquares": [
          { row: 3, col: 3, keyId: 0 }
        ],
        "player": { row: 3, col: 1 }
      },
      {
        "name": "01_3",
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
          { row: 1, col: 4, unlockedBy: 0 },
          { row: 5, col: 4, unlockedBy: 1 }
        ],
        "fruit": [
          { row: 0, col: 6 },
          { row: 6, col: 6 }
        ],
        "player": { row: 3, col: 1 },
        "keySquares": [
          { row: 0, col: 2, keyId: 0 },
          { row: 3, col: 3, keyId: 1 }
        ]
      },
      {
        "name": "02_1",
        "gridSize": [7, 7],
        "trays": [
          { row: 6, col: 0 },
          { row: 6, col: 2 },
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
          { row: 1, col: 4, unlockedBy: 0 },
          { row: 5, col: 4 }
        ],
        "fruit": [
          { row: 0, col: 6, fruitId: 0 },
          { row: 6, col: 6, fruitId: 1 }
        ],
        "keySquares": [
          { row: 3, col: 3, keyId: 0 }
        ],
        "player": { row: 3, col: 1 }
      },
      {
        "name": "02_2",
        "gridSize": [7, 7],
        "trays": [
          { row: 6, col: 0 },
          { row: 6, col: 2 },
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
          { row: 5, col: 4, unlockedBy: 0 }
        ],
        "fruit": [
          { row: 0, col: 6, fruitId: 0 },
          { row: 6, col: 6, fruitId: 1 }
        ],
        "keySquares": [
          { row: 6, col: 2, keyId: 0 },
        ],
        "player": { row: 3, col: 1 }
      },
      {
        "name": "02_3",
        "gridSize": [7, 7],
        "trays": [
          { row: 6, col: 0 },
          { row: 6, col: 2 },
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
          { row: 1, col: 4, unlockedBy: 0 },
          { row: 5, col: 4, unlockedBy: 1 }
        ],
        "fruit": [
          { row: 0, col: 6, fruitId: 0 },
          { row: 6, col: 6, fruitId: 1 }
        ],
        "keySquares": [
          { row: 6, col: 2, keyId: 1 },
          { row: 3, col: 3, keyId: 0 }
        ],
        "player": { row: 3, col: 1 }
      },
    ]

    $scope.initializeGridWhenReady = function () {
      var grid = document.getElementById('grid');
      if (!grid || grid.offsetParent === null) {
        $timeout(function () { $scope.initializeGridWhenReady(); }, 50);
      } else {
        $scope.initializeGrid();
      }
      if (!$scope.active_stim._idsAssigned) {
        $scope.active_stim.doorSquares.forEach((d, i) => d.displayId = i);
        $scope.active_stim.fruit.forEach((f, i) => { if (f.fruitId === undefined) f.fruitId = i; });
        $scope.active_stim._idsAssigned = true;
      }
    }

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
            const door = $scope.active_stim.doorSquares.find(d => d.row === row && d.col === col);
            $scope.cell.style.backgroundImage = `url('${$scope.door_img_url[door.displayId]}')`;
          }

          // Check if this cell is a fruit
          $scope.isFruit = $scope.active_stim.fruit.some(fruit => fruit.row === row && fruit.col === col);
          if ($scope.isFruit) {
            $scope.cell.classList.add('fruit');
            const fruit = $scope.active_stim.fruit.find(f => f.row === row && f.col === col)
            $scope.cell.style.backgroundImage = `url('${$scope.fruit_img_url[fruit.fruitId]}')`;
          }

          $scope.isKey = $scope.active_stim.keySquares.some(key => key.row === row && key.col === col);
          if ($scope.isKey) {
            $scope.cell.classList.add('key-in-grid');
            const key = $scope.active_stim.keySquares.find(k => k.row === row && k.col === col);
            $scope.cell.style.backgroundImage = `url('${$scope.key_img_url[key.keyId]}'), url('images/tray.png')`;
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
      $scope.active_stim = $scope.stimuli[$scope.stim_id];

      $scope.player_x = $scope.active_stim.player.row;
      $scope.player_y = $scope.active_stim.player.col;

      $scope.initializeGrid();
    }
    
    document.addEventListener('keydown', (event) => {
      $scope.$apply(() => {
        $scope.lastButton = event.key;

        if ($scope.has_fruit()) return;

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

        const newR = $scope.active_stim.player.row;
        const newC = $scope.active_stim.player.col;
        const keyIndex = $scope.active_stim.keySquares.findIndex(k => k.row === newR && k.col === newC);
        if (keyIndex !== -1) {
          const keyId = $scope.active_stim.keySquares[keyIndex].keyId;
          $scope.active_stim.keySquares.splice(keyIndex, 1); // remove the key
          $scope.inventory.push({ type: 'key', id: keyId });
        }

        const doorIndex = $scope.active_stim.doorSquares.findIndex(d => d.row === newR && d.col === newC);
        if (doorIndex !== -1) {
          const doorId = $scope.active_stim.doorSquares[doorIndex].unlockedBy;
          $scope.active_stim.doorSquares.splice(doorIndex, 1); // remove the door
        }

        const fruitIndex = $scope.active_stim.fruit.findIndex(f => f.row === newR && f.col === newC);
        if (fruitIndex !== -1) {
          const fruitId = $scope.active_stim.fruit[fruitIndex].fruitId;
          $scope.active_stim.fruit.splice(fruitIndex, 1); // remove the fruit
          $scope.inventory.push({ type: 'fruit', id: fruitId });
          $scope.endMap = true;
        }

        $scope.player_x = $scope.active_stim.player.row;
        $scope.player_y = $scope.active_stim.player.col;
      });
      $scope.initializeGrid();
    });

    $scope.isPassable = function (row, col) {
      const isWall = $scope.active_stim.wallSquares.some(w => w.row === row && w.col === col);
      const door = $scope.active_stim.doorSquares.find(d => d.row === row && d.col === col);

      if (isWall) return false;
      if (door) {
        return $scope.inventory.some(item => item.type === 'key' && item.id === door.unlockedBy);
      }
      return true;
    };

    $scope.getInventoryImg = function (item) {
      if (item.type === 'key') return $scope.key_img_url[item.id];
      if (item.type === 'fruit') return $scope.fruit_img_url[item.id];
      return '';
    };

    $scope.has_fruit = function() {
        return $scope.inventory.some(item => item.type === 'fruit');
    }

    $scope.initGridContainer();
  }
)