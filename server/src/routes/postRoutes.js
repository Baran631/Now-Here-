const express = require("express");
const { requireAuth } = require("../middleware/auth");
const {
  getPosts,
  getPost,
  createPost,
  likePost,
  commentPost,
  reportPost,
  deletePost,
} = require("../controllers/postController");

const router = express.Router();

router.get("/", getPosts);
router.get("/:id", getPost);
router.post("/", requireAuth, createPost);
router.post("/:id/like", requireAuth, likePost);
router.post("/:id/comments", requireAuth, commentPost);
router.post("/:id/report", requireAuth, reportPost);
router.delete("/:id", requireAuth, deletePost);

module.exports = router;
