
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('tetris');
  const context = canvas.getContext('2d');
  const previewCanvas = document.getElementById('preview');
  const previewContext = previewCanvas.getContext('2d');
  const heldCanvas = document.getElementById('held');
  const heldContext = heldCanvas.getContext('2d');

  const audio = new Audio('ha.mp3');
  audio.loop = true; // Enable looping if the audio should play continuously


  
  const rows = 21;
  const cols = 10;
  const blockSize = 30;
  const previewBlockSize = 20;
  const gridColor = 'lightgrey';

  canvas.width = cols * blockSize;
  canvas.height = rows * blockSize;
  previewCanvas.width = 6 * previewBlockSize;
  previewCanvas.height = 4 * previewBlockSize;
  heldCanvas.width = 6 * previewBlockSize;
  heldCanvas.height = 4 * previewBlockSize;

  let score = 0;
  let board = Array.from({ length: rows }, () => Array(cols).fill(null));


//Pentalties
  let aiParams = {
      lineClearReward: 1000,
      holePenalty: -1000,
      heightPenalty: -200,
      bumpinessPenalty: -20,
      wellDepthPenalty: -1000,
      learningRate: 0.1,  //How fast the AI learns from losses
  };

  // Load AI parameters from local storage
  function loadAiParams() {
      const savedParams = localStorage.getItem('aiParams');
      if (savedParams) {
          aiParams = JSON.parse(savedParams);
      }
  }

  // Save AI parameters to local storage
  function saveAiParams() {
      localStorage.setItem('aiParams', JSON.stringify(aiParams));
  }

  // Load AI parameters when the page starts
  loadAiParams();



//Block shapes and colors
  const colors = {
      T: '#800080',
      O: '#ffff00',
      I: '#00ffff',
      J: '#0000ff',
      L: '#ff7f00',
      S: '#00ff00',
      Z: '#ff0000',
  };

  const pieces = {
      T: [[1, 1, 1], [0, 1, 0]],
      O: [[1, 1], [1, 1]],
      I: [[1, 1, 1, 1]],
      J: [[1, 0, 0], [1, 1, 1]],
      L: [[0, 0, 1], [1, 1, 1]],
      S: [[0, 1, 1], [1, 1, 0]],
      Z: [[1, 1, 0], [0, 1, 1]]
  };

    //Starting position
  let position = { x: 3, y: 1 };
  let currentPiece = randomPiece();
  let pieceColor = colors[currentPiece.name];
  let nextPiece = randomPiece();
  let holdPiece = null;
  let canHold = true;
  let aiActive = false;
  let lastTime = 0;
  let dropSpeed = 500;
  let isGameOver = false;
  let aiDropSpeed = 1000; // Slower AI move speed in milliseconds (1 second per move)
  let lastAiMoveTime = 0;


   //For debugging the freeze problem, I think it's gone now though but I'll keep them just in case. 

    let freezeTimeout = 2000; // Time in ms after which we consider the game frozen
  let lastUpdateTime = Date.now();


    //keybinds
  document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') movePiece(-1, 0);
      else if (event.key === 'ArrowRight') movePiece(1, 0);
      else if (event.key === 'ArrowUp') rotatePiece();
      else if (event.key === ' ') dropPieceInstantly();
      else if (event.key === 'ArrowDown') dropPieceSpeed();
      else if (event.key === 'c') hold();
      else if (event.key === 'a') aiActive = !aiActive;
  });
  document.addEventListener('keydown', (event) => {
      if (event.key === '+') aiDropSpeed = Math.max(0, aiDropSpeed - 200); // Faster
      if (event.key === '-') aiDropSpeed = Math.min(2000, aiDropSpeed + 200); // Slower
  });

  document.addEventListener('keyup', (event) => {
      if (event.key === 'ArrowDown') dropSpeed = 500;
  });
  document.addEventListener('keydown', (event) => {
      if (event.key === 'p') {
          if (audio.paused) {
              audio.play().catch(err => console.error("Audio playback failed: ", err));
          } else {
              audio.pause();
          }
      }
  });




  
    //draw the screen & stuff
  function drawScore() {
      context.fillStyle = 'white';
      context.font = '20px Arial';
      context.fillText(`Score: ${score}`, 10, 30);
  }

  function drawBoard() {
      context.clearRect(0, 0, canvas.width, canvas.height);
      board.forEach((row, y) => {
          row.forEach((cell, x) => {
              if (cell) {
                  context.fillStyle = cell;
                  context.fillRect(x * blockSize, y * blockSize, blockSize, blockSize);
              }
          });
      });
      currentPiece.shape.forEach((row, y) => {
          row.forEach((value, x) => {
              if (value) {
                  context.fillStyle = pieceColor;
                  context.fillRect((position.x + x) * blockSize, (position.y + y) * blockSize, blockSize, blockSize);
              }
          });
      });
      drawGrid();
      context.strokeStyle = 'black';
      context.lineWidth = 2;
      context.strokeRect(0, 0, canvas.width, canvas.height);
  }

  function drawGrid() {
      context.strokeStyle = gridColor;
      context.lineWidth = 1;
      for (let x = 0; x <= cols; x++) {
          context.beginPath();
          context.moveTo(x * blockSize, 0);
          context.lineTo(x * blockSize, canvas.height);
          context.stroke();
      }
      for (let y = 0; y <= rows; y++) {
          context.beginPath();
          context.moveTo(0, y * blockSize);
          context.lineTo(canvas.width, y * blockSize);
          context.stroke();
      }
  }

    function randomPiece() {
        const piecesArray = Object.keys(pieces);

        // Increase weight for the I-block to avoid droughts
        const weightedPieces = piecesArray.flatMap(piece =>
            piece === "I" ? [piece, piece] : [piece]
        );

        // Keep track of the last few generated pieces to avoid repetition
        const historyLimit = 3; // Adjust how many recent pieces to remember
        if (!randomPiece.history) randomPiece.history = [];

        let selectedPiece;
        do {
            const randomIndex = Math.floor(Math.random() * weightedPieces.length);
            selectedPiece = weightedPieces[randomIndex];
        } while (randomPiece.history.includes(selectedPiece) && randomPiece.history.length >= historyLimit);

        // Update the history
        randomPiece.history.push(selectedPiece);
        if (randomPiece.history.length > historyLimit) {
            randomPiece.history.shift(); // Remove the oldest piece from the history
        }

        return { name: selectedPiece, shape: pieces[selectedPiece] };
    }


  function drawPreview() {
      previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
      previewContext.fillStyle = colors[nextPiece.name];
      nextPiece.shape.forEach((row, y) => {
          row.forEach((value, x) => {
              if (value) {
                  previewContext.fillRect(
                      x * previewBlockSize + previewBlockSize,
                      y * previewBlockSize + previewBlockSize,
                      previewBlockSize,
                      previewBlockSize
                  );
              }
          });
      });
  }

  function drawHeld() {
      heldContext.clearRect(0, 0, heldCanvas.width, heldCanvas.height);
      if (holdPiece) {
          heldContext.fillStyle = colors[holdPiece.name];
          holdPiece.shape.forEach((row, y) => {
              row.forEach((value, x) => {
                  if (value) {
                      heldContext.fillRect(
                          x * previewBlockSize + previewBlockSize,
                          y * previewBlockSize + previewBlockSize,
                          previewBlockSize,
                          previewBlockSize
                      );
                  }
              });
          });
      }
  }

  function movePiece(dx, dy) {
      position.x += dx;
      if (position.x < 0) position.x = 0;
      else if (position.x + currentPiece.shape[0].length > cols)
          position.x = cols - currentPiece.shape[0].length;

      position.y += dy;
      if (position.y < 0) position.y = 0;
      if (collision()) {
          position.x -= dx;
          position.y -= dy;
          if (dy > 0) {
              placePiece();
          }
      }
  }

  function rotatePiece() {
      const rotatedPiece = currentPiece.shape[0].map((_, index) =>
          currentPiece.shape.map(row => row[row.length - 1 - index])
      );
      const originalShape = currentPiece.shape;
      currentPiece.shape = rotatedPiece;

      if (collision()) {
          currentPiece.shape = originalShape;
      }
  }

  function dropPieceSpeed() {
      dropSpeed = 100;
  }

  function dropPieceInstantly() {
      while (!collision()) {
          position.y++;
      }
      position.y--;
      placePiece();
  }

  function collision(piece = currentPiece, pos = position) {
      return piece.shape.some((row, y) => {
          return row.some((value, x) => {
              const targetY = pos.y + y;
              const targetX = pos.x + x;

              // Check if the current piece position is out of bounds or collides with another piece
              if (value && (
                  targetX < 0 ||                     // Check if the piece is too far left
                  targetX >= cols ||                 // Check if the piece is too far right
                  targetY >= rows ||                 // Check if the piece exceeds the bottom row
                  (board[targetY] && board[targetY][targetX]) // Check if the cell is already filled
              )) {
                  return true; // Collision detected
              }
              return false; // No collision
          });
      });
  }





  function placePiece() {
      // Place the piece on the board
      currentPiece.shape.forEach((row, y) => {
          row.forEach((value, x) => {
              const targetY = position.y + y;
              const targetX = position.x + x;
              if (value && targetY >= 0 && targetY < rows && targetX >= 0 && targetX < cols) {
                  board[targetY][targetX] = pieceColor;
              }
          });
      });

      // Update score and clear full rows
      score += 10;
      clearRows();

      // Move to the next piece
      currentPiece = nextPiece;
      nextPiece = randomPiece();
      pieceColor = colors[currentPiece.name];

      // Reset the position of the new piece
      position = { x: 3, y: 0 };

      // Check for game over condition
      if (collision()) {
          isGameOver = true;
      }

      // Allow holding of the piece after placement
      canHold = true;
  }


  function clearRows() {
      let linesCleared = 0;
      for (let y = rows - 1; y >= 0; y--) {
          if (board[y].every(cell => cell !== null)) {
              board.splice(y, 1);
              board.unshift(Array(cols).fill(null));
              linesCleared++;
              y++;
          }
      }
      score += linesCleared * 100;
      drawScore();
  }

  function hold() {
      if (!canHold) return;
      canHold = false;

      if (holdPiece === null) {
          holdPiece = currentPiece;
          spawnPiece();
      } else {
          const temp = currentPiece;
          currentPiece = holdPiece;
          holdPiece = temp;
          pieceColor = colors[currentPiece.name];
          position = { x: 3, y: 0 };
      }
  }

  function spawnPiece() {
      currentPiece = nextPiece;
      pieceColor = colors[currentPiece.name];
      position = { x: 3, y: 0 };
      nextPiece = randomPiece();
      drawPreview();
      if (collision()) {
          isGameOver = true;
      }
  }

  function aiMove() {
      if (!aiActive || isGameOver) return;

      let bestMove = null;
      let bestScore = -Infinity;
      const depthLimit = currentPiece.name === 'I' && position.y < 4 ? 2 : 4; // Lower depth if I-block is near top

      for (let rotation = 0; rotation < 4; rotation++) {
          const tempPiece = rotatePieceTo(currentPiece, rotation);

          for (let x = -3; x < cols; x++) {
              const tempPosition = { x, y: 0 };

              while (!collision(tempPiece, tempPosition)) {
                  tempPosition.y++;
              }
              tempPosition.y--;

              if (tempPosition.y < 0) continue;

              const tempBoard = simulateBoard(tempPiece, tempPosition);
              const score = evaluateBoard(tempBoard, depthLimit); // Use adjusted depth for I-blocks

              if (score > bestScore) {
                  bestScore = score;
                  bestMove = { x, rotation };
              }
          }
      }

      if (bestMove) {
          for (let i = 0; i < bestMove.rotation; i++) rotatePiece();
          position.x = bestMove.x;
          dropPieceInstantly();
      }
  }


  function evaluateNextPiece(board, nextPiece) {
      let bestFutureScore = -Infinity;

      for (let rotation = 0; rotation < 4; rotation++) {
          const rotatedNextPiece = rotatePieceTo(nextPiece, rotation);

          for (let x = -3; x < cols; x++) {
              const tempPosition = { x, y: 0 };

              while (!collision(rotatedNextPiece, tempPosition, board)) {
                  tempPosition.y++;
              }
              tempPosition.y--;

              if (tempPosition.y < 0) continue;

              const futureBoard = simulateBoard(rotatedNextPiece, tempPosition, board);
              const futureScore = evaluateBoard(futureBoard);

              if (futureScore > bestFutureScore) {
                  bestFutureScore = futureScore;
              }
          }
      }

      return bestFutureScore;
  }


  function rotatePieceTo(piece, times) {
      let rotatedPiece = piece.shape;
      for (let i = 0; i < times; i++) {
          rotatedPiece = rotatedPiece[0].map((_, index) =>
              rotatedPiece.map(row => row[row.length - 1 - index])
          );
      }
      return { ...piece, shape: rotatedPiece };
  }

  function simulateBoard(piece, pos, customBoard = board) {
      const tempBoard = customBoard.map(row => [...row]);
      piece.shape.forEach((row, y) => {
          row.forEach((value, x) => {
              if (value && pos.y + y < rows && pos.x + x >= 0 && pos.x + x < cols) {
                  tempBoard[pos.y + y][pos.x + x] = colors[piece.name];
              }
          });
      });
      return tempBoard;
  }


  function evaluateBoard(tempBoard) {
      let score = 0;
      let linesCleared = 0;
      let totalHeight = 0;
      let holes = 0;
      let bumpiness = 0;

      const heights = Array(cols).fill(0);

      tempBoard.forEach((row, y) => {
          if (row.every(cell => cell !== null)) {
              linesCleared++;
          }
          row.forEach((cell, x) => {
              if (cell) {
                  if (heights[x] === 0) {
                      heights[x] = rows - y;
                  }
              } else if (heights[x] > 0) {
                  holes++;
              }
          });
      });

      totalHeight = heights.reduce((acc, h) => acc + h, 0);
      for (let i = 0; i < heights.length - 1; i++) {
          bumpiness += Math.abs(heights[i] - heights[i + 1]);
      }
      const wellDepthPenalty = calculateWellDepth(tempBoard) * 100;

      // Calculate score with dynamic parameters
      score += linesCleared * aiParams.lineClearReward;
      score += holes * aiParams.holePenalty;
      score += totalHeight * aiParams.heightPenalty;
      score += bumpiness * aiParams.bumpinessPenalty;
      score += wellDepthPenalty * aiParams.wellDepthPenalty;

      // Update AI parameters based on performance
      aiParams.lineClearReward += aiParams.learningRate * linesCleared * 10;
      aiParams.holePenalty -= aiParams.learningRate * holes * 10;
      aiParams.heightPenalty -= aiParams.learningRate * totalHeight * 5;
      aiParams.bumpinessPenalty -= aiParams.learningRate * bumpiness * 2;

      return score;
  }





  function calculateWellDepth(board) {
      let totalWellDepth = 0;
      for (let x = 0; x < cols; x++) {
          let wellDepth = 0;
          let inWell = false;
          for (let y = 0; y < rows; y++) {
              if (board[y][x] === null) {
                  if (inWell) {
                      wellDepth++;
                  } else if ((x === 0 || board[y][x - 1] !== null) && (x === cols - 1 || board[y][x + 1] !== null)) {
                      inWell = true;
                      wellDepth = 1;
                  }
              } else {
                  inWell = false;
                  totalWellDepth += wellDepth * (x === 0 || x === cols - 1 ? 2 : 1);  // Higher penalty for edge wells
                  wellDepth = 0;
              }
          }
          totalWellDepth += wellDepth * (x === 0 || x === cols - 1 ? 2 : 1);
      }
      return totalWellDepth;
  }


  function endGame() {
      isGameOver = true;
      saveAiParams();  // Save AI parameters when the game ends
      // Display Game Over or restart prompt
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'black';
      context.font = '30px Arial';
      context.fillText('Game Over', canvas.width / 2 - 100, canvas.height / 2);
  }

  function startNewGame() {
      isGameOver = false;
      score = 0;
      board = Array.from({ length: rows }, () => Array(cols).fill(null));
      position = { x: 3, y: 0 };
      currentPiece = randomPiece();
      nextPiece = randomPiece();
      aiActive = true;  // Set to true to make the AI play automatically
      requestAnimationFrame(gameLoop);  // Start the game loop
  }

  function playSound() {
      if (audio.paused) {
          audio.play().catch(err => console.error("Audio playback failed: ", err));
      }
  }

  
function gameLoop(timestamp) {
  if (isGameOver) {
      endGame();  // Call the endGame function when the game is over
      setTimeout(startNewGame, 1000);  // Restart after 1 second
      return;
  }

  //if (Date.now() - lastUpdateTime > freezeTimeout) {
    //  console.warn("Game detected freeze, resetting.");
      //endGame();  // Call the endGame function when the game is over
  //}

  if (aiActive && timestamp - lastAiMoveTime > aiDropSpeed) {
      aiMove();
      lastAiMoveTime = timestamp;
  }

  const deltaTime = timestamp - lastTime;
  if (deltaTime > dropSpeed) {
      movePiece(0, 1);
      lastTime = timestamp;
  }
  playSound("audio (2).mp3");
  drawBoard();
  drawPreview();
  drawHeld();
  drawScore();
  lastUpdateTime = Date.now(); // Reset update time
  requestAnimationFrame(gameLoop);
}

   
  requestAnimationFrame(gameLoop);
});
