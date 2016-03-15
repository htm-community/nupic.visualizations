module.exports = function (req, res, next){
  res.writeHead(404, {'Content-Type': 'text/html'});
  var html = "<!DOCTYPE html>" +
              "<html>" +
                "<head>" +
                  "<title>404 Not Found</title>" +
                "</head>" +
                "<body>" +
                  "<h1>Not Found</h1>" +
                  "<p>The requested URL was not found on this server.</p>" +
                "</body>" +
              "</html>";
  res.end(html);
};
